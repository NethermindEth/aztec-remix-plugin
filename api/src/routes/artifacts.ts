import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { ApiResponse } from '../types.js';

const ARTIFACT_DIR = path.join(os.homedir(), '.aztec', 'plugin-artifacts');

// Default: clean artifacts older than 7 days
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
// Default: keep total size under 500MB
const DEFAULT_MAX_SIZE_BYTES = 500 * 1024 * 1024;

interface ArtifactEntry {
  name: string;
  size: number;
  created: string;
  ageMs: number;
}

async function listArtifacts(): Promise<ArtifactEntry[]> {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  const files = await fs.readdir(ARTIFACT_DIR);
  const now = Date.now();
  const entries: ArtifactEntry[] = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const stat = await fs.stat(path.join(ARTIFACT_DIR, file));
    entries.push({
      name: file,
      size: stat.size,
      created: stat.birthtime.toISOString(),
      ageMs: now - stat.birthtime.getTime(),
    });
  }

  // Sort oldest first (for cleanup)
  entries.sort((a, b) => b.ageMs - a.ageMs);
  return entries;
}

/**
 * Auto-cleanup: remove artifacts older than maxAgeMs, then remove oldest
 * until total size is under maxSizeBytes. Returns number deleted.
 */
export async function autoCleanArtifacts(
  maxAgeMs: number = DEFAULT_MAX_AGE_MS,
  maxSizeBytes: number = DEFAULT_MAX_SIZE_BYTES,
): Promise<number> {
  const entries = await listArtifacts();
  let deleted = 0;
  let totalSize = entries.reduce((sum, e) => sum + e.size, 0);

  for (const entry of entries) {
    // Delete if too old
    if (entry.ageMs > maxAgeMs) {
      await fs.unlink(path.join(ARTIFACT_DIR, entry.name)).catch(() => {});
      totalSize -= entry.size;
      deleted++;
      continue;
    }

    // Delete oldest if over size limit
    if (totalSize > maxSizeBytes) {
      await fs.unlink(path.join(ARTIFACT_DIR, entry.name)).catch(() => {});
      totalSize -= entry.size;
      deleted++;
    }
  }

  return deleted;
}

export function createArtifactsRouter() {
  const router = Router();

  // List stored artifacts
  router.get('/', async (_req, res) => {
    try {
      const entries = await listArtifacts();
      // Sort newest first for display
      entries.sort((a, b) => a.ageMs - b.ageMs);
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

  // Auto-cleanup by age/size
  router.post('/cleanup', async (req, res) => {
    try {
      const { maxAgeDays, maxSizeMb } = req.body as { maxAgeDays?: number; maxSizeMb?: number };
      const maxAgeMs = maxAgeDays ? maxAgeDays * 24 * 60 * 60 * 1000 : DEFAULT_MAX_AGE_MS;
      const maxSizeBytes = maxSizeMb ? maxSizeMb * 1024 * 1024 : DEFAULT_MAX_SIZE_BYTES;

      const deleted = await autoCleanArtifacts(maxAgeMs, maxSizeBytes);
      res.json({
        success: true,
        data: { deleted, policy: { maxAgeDays: maxAgeMs / (24 * 60 * 60 * 1000), maxSizeMb: maxSizeBytes / (1024 * 1024) } },
      } satisfies ApiResponse);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to cleanup artifacts';
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
