import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { AztecService } from './services/aztec-service.js';
import { compileWithStream } from './services/compile-stream.js';
import compileRouter from './routes/compile.js';
import { createNetworkRouter } from './routes/network.js';
import { createAccountsRouter } from './routes/accounts.js';
import { createDeployRouter } from './routes/deploy.js';
import { createInteractRouter } from './routes/interact.js';
import { createSettingsRouter } from './routes/settings.js';
import { createArtifactsRouter, autoCleanArtifacts } from './routes/artifacts.js';
import { createAuthWitRouter } from './routes/authwit.js';
import { createTransactionsRouter } from './routes/transactions.js';
import { createRegisterContractRouter } from './routes/register-contract.js';

async function main() {
  const app = express();
  const PORT = process.env.PORT || 3001;

  // Shared service instance — factory awaits settings load
  const aztecService = await AztecService.create();

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // REST Routes
  app.use('/compile', compileRouter);
  app.use('/network', createNetworkRouter(aztecService));
  app.use('/accounts', createAccountsRouter(aztecService));
  app.use('/deploy', createDeployRouter(aztecService));
  app.use('/interact', createInteractRouter(aztecService));
  app.use('/settings', createSettingsRouter(aztecService));
  app.use('/artifacts', createArtifactsRouter());
  app.use('/authwit', createAuthWitRouter(aztecService));
  app.use('/transactions', createTransactionsRouter(aztecService));
  app.use('/register-contract', createRegisterContractRouter(aztecService));

  // Create HTTP server and attach WebSocket
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws/compile' });

  wss.on('connection', (ws: WebSocket) => {
    ws.on('message', async (data: Buffer) => {
      try {
        const { sources, contractName } = JSON.parse(data.toString()) as {
          sources: Record<string, string>;
          contractName: string;
        };

        if (!sources || !contractName) {
          ws.send(JSON.stringify({ type: 'error', data: 'Missing sources or contractName' }));
          ws.close();
          return;
        }

        ws.send(JSON.stringify({ type: 'status', data: 'Compilation started...' }));

        await compileWithStream(sources, contractName, {
          onStdout(line) {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'stdout', data: line }));
            }
          },
          onStderr(line) {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'stderr', data: line }));
            }
          },
          onComplete(result) {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'complete',
                data: {
                  success: result.exitCode === 0,
                  artifacts: result.artifacts,
                  exitCode: result.exitCode,
                },
              }));
              ws.close();
            }
          },
          onError(error) {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'error', data: error }));
              ws.close();
            }
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Invalid message';
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'error', data: msg }));
          ws.close();
        }
      }
    });
  });

  server.listen(PORT, async () => {
    console.log(`Aztec Remix API server running on http://localhost:${PORT}`);
    console.log(`WebSocket compile endpoint: ws://localhost:${PORT}/ws/compile`);

    try {
      const deleted = await autoCleanArtifacts();
      if (deleted > 0) {
        console.log(`Auto-cleanup: removed ${deleted} old artifact(s)`);
      }
    } catch {
      // Non-critical
    }
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
