import express from 'express';
import cors from 'cors';
import { AztecService } from './services/aztec-service.js';
import compileRouter from './routes/compile.js';
import { createNetworkRouter } from './routes/network.js';
import { createAccountsRouter } from './routes/accounts.js';
import { createDeployRouter } from './routes/deploy.js';
import { createInteractRouter } from './routes/interact.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Shared service instance
const aztecService = new AztecService();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Large limit for contract artifacts

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Routes
app.use('/compile', compileRouter);
app.use('/network', createNetworkRouter(aztecService));
app.use('/accounts', createAccountsRouter(aztecService));
app.use('/deploy', createDeployRouter(aztecService));
app.use('/interact', createInteractRouter(aztecService));

app.listen(PORT, () => {
  console.log(`Aztec Remix API server running on http://localhost:${PORT}`);
});
