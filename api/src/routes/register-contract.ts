import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AztecService } from '../services/aztec-service.js';
import { ARTIFACT_DIR } from '../config.js';
import type { ApiResponse } from '../types.js';

interface RegisterContractRequest {
  address: string;
  artifact: object;
  alias?: string;
  args?: unknown[];
}

export function createRegisterContractRouter(aztecService: AztecService) {
  const router = Router();

  router.post('/', async (req, res) => {
    try {
      const { address, artifact, alias, args } = req.body as RegisterContractRequest;

      if (!address || !artifact) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: address, artifact',
        } satisfies ApiResponse);
        return;
      }

      // Write artifact to persistent location
      await fs.mkdir(ARTIFACT_DIR, { recursive: true });
      const artifactName = (artifact as { name?: string }).name || 'contract';
      const artifactFile = path.join(ARTIFACT_DIR, `${artifactName}-registered-${Date.now()}.json`);
      await fs.writeFile(artifactFile, JSON.stringify(artifact));

      const result = await aztecService.registerContract({
        address,
        artifactPath: artifactFile,
        alias,
        args,
      });

      res.json({ success: true, data: result } satisfies ApiResponse);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to register contract';
      res.status(500).json({ success: false, error: message } satisfies ApiResponse);
    }
  });

  return router;
}
