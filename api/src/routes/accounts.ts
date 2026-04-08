import { Router } from 'express';
import { AztecService } from '../services/aztec-service.js';
import type { ApiResponse, AccountInfo } from '../types.js';

export function createAccountsRouter(aztecService: AztecService) {
  const router = Router();

  router.get('/', async (_req, res) => {
    try {
      const accounts = await aztecService.getAccounts();
      res.json({ success: true, data: accounts } satisfies ApiResponse<AccountInfo[]>);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get accounts';
      res.status(500).json({ success: false, error: message } satisfies ApiResponse);
    }
  });

  router.post('/import-test', async (_req, res) => {
    try {
      const accounts = await aztecService.importTestAccounts();
      res.json({ success: true, data: accounts } satisfies ApiResponse<AccountInfo[]>);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to import test accounts';
      res.status(500).json({ success: false, error: message } satisfies ApiResponse);
    }
  });

  router.post('/create', async (req, res) => {
    try {
      const { alias } = req.body as { alias?: string };
      const account = await aztecService.createAccount(alias);
      res.json({ success: true, data: account } satisfies ApiResponse<AccountInfo>);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create account';
      res.status(500).json({ success: false, error: message } satisfies ApiResponse);
    }
  });

  return router;
}
