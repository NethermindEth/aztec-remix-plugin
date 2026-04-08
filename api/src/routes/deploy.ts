import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AztecService } from '../services/aztec-service.js';
import { ARTIFACT_DIR } from '../config.js';
import type { DeployRequest, ApiResponse, DeployResult } from '../types.js';

async function ensureArtifactDir() {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
}

export function createDeployRouter(aztecService: AztecService) {
  const router = Router();

  router.post('/', async (req, res) => {
    try {
      const { artifact, args, from, alias } = req.body as DeployRequest;

      if (!artifact || !from) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: artifact, from',
        } satisfies ApiResponse);
        return;
      }

      // Write artifact to a persistent location so aztec-wallet can reference it later
      await ensureArtifactDir();
      const artifactName = (artifact as { name?: string }).name || 'contract';
      const artifactFile = path.join(ARTIFACT_DIR, `${artifactName}-${Date.now()}.json`);
      await fs.writeFile(artifactFile, JSON.stringify(artifact));

      const result = await aztecService.deploy(
        artifactFile,
        args || [],
        from,
        alias,
      );

      res.json({
        success: true,
        data: result,
      } satisfies ApiResponse<DeployResult>);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Deployment failed';
      res.status(500).json({ success: false, error: message } satisfies ApiResponse);
    }
  });

  return router;
}
