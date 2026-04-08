import { Router } from 'express';
import { AztecService } from '../services/aztec-service.js';
import type { ApiResponse, AccountInfo } from '../types.js';

export function createAccountsRouter(aztecService: AztecService) {
  const router = Router();

  // List known accounts (from aztec-wallet aliases)
  router.get('/', async (_req, res) => {
    try {
      const accounts = await aztecService.getAccounts();
      res.json({
        success: true,
        data: accounts,
      } satisfies ApiResponse<AccountInfo[]>);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get accounts';
      res.status(500).json({ success: false, error: message } satisfies ApiResponse);
    }
  });

  // Import test accounts from the local network
  router.post('/import-test', async (_req, res) => {
    try {
      const accounts = await aztecService.importTestAccounts();
      res.json({
        success: true,
        data: accounts,
      } satisfies ApiResponse<AccountInfo[]>);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to import test accounts';
      res.status(500).json({ success: false, error: message } satisfies ApiResponse);
    }
  });

  return router;
}
