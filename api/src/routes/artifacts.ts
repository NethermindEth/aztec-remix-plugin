import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { ApiResponse } from '../types.js';

const ARTIFACT_DIR = path.join(os.homedir(), '.aztec', 'plugin-artifacts');

interface ArtifactEntry {
  name: string;
  size: number;
  created: string;
}

export function createArtifactsRouter() {
  const router = Router();

  // List stored artifacts
  router.get('/', async (_req, res) => {
    try {
      await fs.mkdir(ARTIFACT_DIR, { recursive: true });
      const files = await fs.readdir(ARTIFACT_DIR);
      const entries: ArtifactEntry[] = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const stat = await fs.stat(path.join(ARTIFACT_DIR, file));
        entries.push({
          name: file,
          size: stat.size,
          created: stat.birthtime.toISOString(),
        });
      }

      // Sort newest first
      entries.sort((a, b) => b.created.localeCompare(a.created));

      const totalSize = entries.reduce((sum, e) => sum + e.size, 0);

      res.json({
        success: true,
        data: { artifacts: entries, totalSize, directory: ARTIFACT_DIR },
      } satisfies ApiResponse);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list artifacts';
      res.status(500).json({ success: false, error: message } satisfies ApiResponse);
    }
  });

  // Delete all artifacts
  router.delete('/', async (_req, res) => {
    try {
      await fs.mkdir(ARTIFACT_DIR, { recursive: true });
      const files = await fs.readdir(ARTIFACT_DIR);
      let deleted = 0;
      for (const file of files) {
        if (file.endsWith('.json')) {
          await fs.unlink(path.join(ARTIFACT_DIR, file));
          deleted++;
        }
      }
      res.json({
        success: true,
        data: { deleted },
      } satisfies ApiResponse);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to clean artifacts';
      res.status(500).json({ success: false, error: message } satisfies ApiResponse);
    }
  });

  // Delete a specific artifact
  router.delete('/:name', async (req, res) => {
    try {
      const name = req.params.name;
      if (!name.endsWith('.json') || name.includes('..') || name.includes('/')) {
        res.status(400).json({ success: false, error: 'Invalid artifact name' } satisfies ApiResponse);
        return;
      }
      const filePath = path.join(ARTIFACT_DIR, name);
      try {
        await fs.access(filePath);
      } catch {
        res.status(404).json({ success: false, error: 'Artifact not found' } satisfies ApiResponse);
        return;
      }
      await fs.unlink(filePath);
      res.json({ success: true } satisfies ApiResponse);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete artifact';
      res.status(500).json({ success: false, error: message } satisfies ApiResponse);
    }
  });

  return router;
}
