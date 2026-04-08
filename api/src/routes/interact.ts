import { Router } from 'express';
import { AztecService } from '../services/aztec-service.js';
import type { InteractRequest, ApiResponse, InteractResult } from '../types.js';

export function createInteractRouter(aztecService: AztecService) {
  const router = Router();

  router.post('/', async (req, res) => {
    try {
      const { contractAddress, functionName, args, action, from } =
        req.body as InteractRequest;

      if (!contractAddress || !functionName || !action || !from) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: contractAddress, functionName, action, from',
        } satisfies ApiResponse);
        return;
      }

      const result = await aztecService.interact(
        contractAddress,
        functionName,
        args || [],
        action,
        from,
      );

      res.json({
        success: true,
        data: result,
      } satisfies ApiResponse<InteractResult>);
    } catch (err) {
      const message = err instanceof Error ? err.message : `${req.body?.action || 'Interact'} failed`;
      res.status(500).json({ success: false, error: message } satisfies ApiResponse);
    }
  });

  return router;
}
