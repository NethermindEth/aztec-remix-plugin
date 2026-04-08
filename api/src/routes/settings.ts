import { Router } from 'express';
import { AztecService, ProverMode } from '../services/aztec-service.js';
import type { ApiResponse } from '../types.js';

const VALID_PROVER_MODES: ProverMode[] = ['none', 'wasm', 'native'];

export function createSettingsRouter(aztecService: AztecService) {
  const router = Router();

  router.get('/prover', (_req, res) => {
    res.json({
      success: true,
      data: { mode: aztecService.getProverMode() },
    } satisfies ApiResponse);
  });

  router.put('/prover', (req, res) => {
    const { mode } = req.body as { mode?: string };
    if (!mode || !VALID_PROVER_MODES.includes(mode as ProverMode)) {
      res.status(400).json({
        success: false,
        error: `Invalid prover mode. Must be one of: ${VALID_PROVER_MODES.join(', ')}`,
      } satisfies ApiResponse);
      return;
    }

    aztecService.setProverMode(mode as ProverMode);
    res.json({
      success: true,
      data: { mode: aztecService.getProverMode() },
    } satisfies ApiResponse);
  });

  return router;
}
