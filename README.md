# Aztec Remix Plugin

A Remix IDE plugin for compiling, deploying, and interacting with [Aztec](https://aztec.network/) Noir smart contracts. Connect your local Aztec network and get a full development workflow inside the browser.

## Features

- **Compile** — Write Noir contracts in Remix, compile via `aztec compile` with real-time streaming logs and inline editor error annotations
- **Deploy** — Deploy contracts to your local Aztec network with constructor args and contract aliases
- **Interact** — Call private, public, and utility functions on deployed contracts (send or simulate)
- **AuthWitness** — Create private auth witnesses or authorize public actions for cross-contract calls
- **Transactions** — View recent transactions and look up tx details by hash
- **Accounts** — Import test accounts or create new Schnorr accounts
- **At Address** — Load and interact with pre-deployed contracts by address
- **Multi-file** — Recursive `src/` directory walking for complex Noir module structures
- **Persistence** — Deployed contracts and compiled artifacts survive page refreshes

## Architecture

```
Remix IDE (browser)                Backend (localhost:3001)
┌────────────────────┐            ┌─────────────────────────┐
│  Aztec Plugin      │  REST/WS   │  Express + WebSocket    │
│  (React iframe)    │ ────────>  │                         │
│                    │            │  aztec compile (cwd)    │
│  5 tabs:           │            │  aztec-wallet CLI       │
│  Compile │ Deploy  │            │  node_* JSON-RPC        │
│  Interact│ AuthWit │            └───────────┬─────────────┘
│  Txs     │         │                        │
└────────────────────┘            ┌───────────▼─────────────┐
                                  │  Aztec Node (:8080)     │
                                  │  Local Network          │
                                  └─────────────────────────┘
```

The backend shells out to `aztec-wallet` CLI for all PXE operations (accounts, deploy, interact, authwit) since the Aztec Node only exposes `node_*` JSON-RPC methods.

## Prerequisites

- **Node.js 23+** (24 recommended)
- **Aztec CLI** installed at `~/.aztec/` — [install guide](https://docs.aztec.network/developers/getting_started_on_local_network)
- **Aztec local network** running:
  ```bash
  aztec start --local-network
  ```

## Quick Start

```bash
# Install dependencies
npm install

# Start backend (terminal 1)
npm run dev:api

# Start frontend (terminal 2)
npm run dev:plugin
```

Then in [Remix IDE](https://remix.ethereum.org):

1. Plugin Manager → **Connect to a Local Plugin**
2. URL: `http://localhost:5173`, Type: `iframe`, Location: `sidePanel`
3. Click **OK**

## Usage

### 1. Connect
Enter `http://localhost:8080` and click **Connect**. Import test accounts or create new ones.

### 2. Compile
Open a `.nr` file in the Remix editor and click **Compile**. The plugin:
- Collects all `.nr` files recursively from `src/`
- Sends your `Nargo.toml` if present (or generates a default)
- Streams compilation logs in real time via WebSocket
- Shows inline error annotations in the editor on failure
- Writes artifacts to `artifacts/` in the Remix file explorer

### 3. Deploy
Select a compiled artifact, choose an account, set a contract alias, fill in constructor args, and click **Deploy**.

### 4. Interact
Select a deployed contract to see all callable functions grouped by type (Private/Public/Utility). Internal protocol functions are hidden. Use **Send** for state-changing calls or **Simulate** for read-only.

### 5. AuthWitness
Authorize another account to call functions on your behalf — either privately (off-chain auth witness) or publicly (on-chain authorization).

### 6. Transactions
View recent transactions or look up a specific tx by hash.

## Example Contract

```noir
use aztec::macros::aztec;

#[aztec]
contract Counter {
    use aztec::{
        macros::{functions::{external, initializer}, storage::storage},
        state_vars::PublicMutable,
    };

    #[storage]
    struct Storage<Context> {
        count: PublicMutable<u64, Context>,
    }

    #[initializer]
    #[external("public")]
    fn constructor(initial_count: u64) {
        self.storage.count.write(initial_count);
    }

    #[external("public")]
    fn increment() {
        let current = self.storage.count.read();
        self.storage.count.write(current + 1);
    }

    #[external("utility")]
    unconstrained fn get_count() -> pub u64 {
        self.storage.count.read()
    }
}
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/compile` | POST | Compile Noir sources (REST) |
| `ws://…/ws/compile` | WS | Compile with streaming logs |
| `/network/connect` | POST | Connect to Aztec node |
| `/network/info` | GET | Connection status |
| `/accounts` | GET | List accounts |
| `/accounts/import-test` | POST | Import test accounts |
| `/accounts/create` | POST | Create new account |
| `/deploy` | POST | Deploy contract |
| `/interact` | POST | Call contract function |
| `/authwit/create` | POST | Create private auth witness |
| `/authwit/authorize` | POST | Authorize public action |
| `/register-contract` | POST | Register existing contract |
| `/transactions` | GET | Recent transactions |
| `/transactions/:hash` | GET | Transaction details |
| `/settings/prover` | GET/PUT | Prover mode (none/wasm/native) |
| `/artifacts` | GET/DELETE | Manage stored artifacts |
| `/artifacts/cleanup` | POST | Auto-cleanup by age/size |

## Project Structure

```
aztec-remix-plugin/
├── api/                    # Express + WebSocket backend
│   └── src/
│       ├── index.ts        # Server entry
│       ├── routes/         # REST endpoints
│       └── services/       # aztec-wallet CLI, compiler, streaming
└── plugin/                 # React + Vite frontend
    └── src/
        ├── App.tsx         # Root with 5 tabs
        ├── remix-client.ts # Remix IDE plugin client
        ├── api.ts          # Backend HTTP client
        └── components/     # Compile, Deploy, Interact, AuthWit, Txs tabs
```

## Settings

- **Prover mode** — toggle between None (fast, no proofs), WASM, or Native in the header. Persists across backend restarts.
- **Artifact cleanup** — manual "Clean Artifacts" button in header, or auto-cleanup on startup (>7 days or >500MB).
- **Nargo.toml** — default uses `v4.0.0-devnet.2-patch.0`. Place your own `Nargo.toml` in the project root to override.

## Built With

- [React](https://react.dev/) + [Vite](https://vitejs.dev/) — frontend
- [Express](https://expressjs.com/) + [ws](https://github.com/websockets/ws) — backend
- [@remixproject/plugin-webview](https://www.npmjs.com/package/@remixproject/plugin-webview) — Remix IDE integration
- [Aztec](https://aztec.network/) — `aztec compile`, `aztec-wallet` CLI

## License

MIT
