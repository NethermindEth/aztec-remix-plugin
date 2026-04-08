import { Router } from 'express';
import { CompilerService } from '../services/compiler-service.js';
import type { CompileRequest, ApiResponse, CompileResult } from '../types.js';

const router = Router();
const compilerService = new CompilerService();

router.post('/', async (req, res) => {
  try {
    const { sources, contractName } = req.body as CompileRequest;

    if (!sources || !contractName) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: sources, contractName',
      } satisfies ApiResponse);
      return;
    }

    const result = await compilerService.compile(sources, contractName);

    res.json({
      success: true,
      data: result,
    } satisfies ApiResponse<CompileResult>);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Compilation failed';
    res.status(500).json({
      success: false,
      error: message,
    } satisfies ApiResponse);
  }
});

export default router;
