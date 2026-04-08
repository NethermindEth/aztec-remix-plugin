import { Router } from 'express';
import { AztecService } from '../services/aztec-service.js';
import type { ApiResponse } from '../types.js';

export function createTransactionsRouter(aztecService: AztecService) {
  const router = Router();

  // Get recent transactions
  router.get('/', async (_req, res) => {
    try {
      const result = await aztecService.getRecentTxs();
      res.json({ success: true, data: result } satisfies ApiResponse);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get transactions';
      res.status(500).json({ success: false, error: message } satisfies ApiResponse);
    }
  });

  // Get details for a specific transaction
  router.get('/:txHash', async (req, res) => {
    try {
      const result = await aztecService.getTxDetails(req.params.txHash);
      res.json({ success: true, data: result } satisfies ApiResponse);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get transaction details';
      res.status(500).json({ success: false, error: message } satisfies ApiResponse);
    }
  });

  return router;
}
