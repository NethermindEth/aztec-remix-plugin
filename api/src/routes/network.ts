import { Router } from 'express';
import { AztecService } from '../services/aztec-service.js';
import type { ConnectRequest, ApiResponse, NetworkInfo } from '../types.js';

export function createNetworkRouter(aztecService: AztecService) {
  const router = Router();

  router.post('/connect', async (req, res) => {
    try {
      const { nodeUrl } = req.body as ConnectRequest;
      if (!nodeUrl) {
        res.status(400).json({
          success: false,
          error: 'Missing required field: nodeUrl',
        } satisfies ApiResponse);
        return;
      }

      const info = await aztecService.connect(nodeUrl);
      res.json({ success: true, data: info } satisfies ApiResponse<NetworkInfo>);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      res.status(500).json({ success: false, error: message } satisfies ApiResponse);
    }
  });

  // Clear stale wallet/PXE data (for when local network restarts)
  router.post('/clear-wallet-data', async (_req, res) => {
    try {
      await aztecService.clearWalletData();
      res.json({ success: true, data: { cleared: true } } satisfies ApiResponse);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to clear wallet data';
      res.status(500).json({ success: false, error: message } satisfies ApiResponse);
    }
  });

  router.get('/info', async (_req, res) => {
    try {
      const info = await aztecService.getNetworkInfo();
      res.json({ success: true, data: info } satisfies ApiResponse<NetworkInfo>);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get network info';
      res.status(500).json({ success: false, error: message } satisfies ApiResponse);
    }
  });

  return router;
}
