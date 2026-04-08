import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { AztecService } from '../services/aztec-service.js';
import type { ApiResponse } from '../types.js';

const ARTIFACT_DIR = path.join(os.homedir(), '.aztec', 'plugin-artifacts');

interface AuthWitRequest {
  functionName: string;
  caller: string;
  contractAddress: string;
  artifact: object;
  from: string;
  args?: unknown[];
  alias?: string;
}

interface AuthorizeActionRequest {
  functionName: string;
  caller: string;
  contractAddress: string;
  from: string;
  args?: unknown[];
}

export function createAuthWitRouter(aztecService: AztecService) {
  const router = Router();

  // Create a private authorization witness
  router.post('/create', async (req, res) => {
    try {
      const body = req.body as AuthWitRequest;
      if (!body.functionName || !body.caller || !body.contractAddress || !body.from || !body.artifact) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: functionName, caller, contractAddress, from, artifact',
        } satisfies ApiResponse);
        return;
      }

      // Write artifact to a file — create-authwit needs --contract-artifact <path>
      await fs.mkdir(ARTIFACT_DIR, { recursive: true });
      const artifactName = (body.artifact as { name?: string }).name || 'contract';
      const artifactFile = path.join(ARTIFACT_DIR, `${artifactName}-authwit.json`);
      await fs.writeFile(artifactFile, JSON.stringify(body.artifact));

      const result = await aztecService.createAuthWit({
        functionName: body.functionName,
        caller: body.caller,
        contractAddress: body.contractAddress,
        contractArtifactPath: artifactFile,
        from: body.from,
        args: body.args,
        alias: body.alias,
      });

      res.json({ success: true, data: result } satisfies ApiResponse);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create auth witness';
      res.status(500).json({ success: false, error: message } satisfies ApiResponse);
    }
  });

  // Authorize a public action
  router.post('/authorize', async (req, res) => {
    try {
      const body = req.body as AuthorizeActionRequest;
      if (!body.functionName || !body.caller || !body.contractAddress || !body.from) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: functionName, caller, contractAddress, from',
        } satisfies ApiResponse);
        return;
      }

      const result = await aztecService.authorizeAction(body);
      res.json({ success: true, data: result } satisfies ApiResponse);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to authorize action';
      res.status(500).json({ success: false, error: message } satisfies ApiResponse);
    }
  });

  return router;
}
