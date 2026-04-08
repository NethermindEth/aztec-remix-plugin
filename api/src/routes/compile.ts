import { Router } from 'express';
import { CompilerService } from '../services/compiler-service.js';
import type { CompileRequest, ApiResponse, CompileResult, CompileError } from '../types.js';

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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Compilation failed';
    // Pass through structured errors if available
    const errors = (err as { errors?: CompileError[] }).errors;
    res.status(500).json({
      success: false,
      error: message,
      data: errors ? { errors } : undefined,
    } satisfies ApiResponse);
  }
});

export default router;
