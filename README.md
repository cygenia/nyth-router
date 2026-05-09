# Bigliner

**AI gateway for multi-provider routing.** Bigliner sits between your apps and 100+ AI providers, gives you one unified API key, smart routing with fallback, real-time analytics, an OAuth-style flow for granting apps access, and an animated dashboard to manage everything.

> One key for your apps. Many providers under the hood. Clear routing, usage, and cost visibility.

```
┌──────────┐    bl_********   ┌──────────────┐    provider keys    ┌────────────┐
│  Your    │ ───────────────► │   Bigliner   │ ───────────────────►│  OpenAI    │
│  Apps    │                  │  AI Gateway  │                     │  Anthropic │
└──────────┘                  └──────────────┘                     │  Gemini    │
                                  ▲   ▲                            │  Groq      │
                              dashboard │                          │  Mistral   │
                              + logs    │                          │  Ollama    │
                                        └─ encrypted SQLite vault  │  …         │
                                                                   └────────────┘
```

## Features

- **100+ providers / 175+ models** — registry of cloud, aggregator, serverless, local-runtime, embedding, image and audio providers, captured as of May 2026 (GPT-5.5, Claude Opus 4.7, Gemini 3.0, Llama 4, etc.).
- **Real OpenAI-compatible gateway** at `/v1/chat/completions` with prefix routing (`openai:gpt-5.5`), aliases (`bigliner-cheap`), default routes, and a fallback chain.
- **Anthropic adapter** that translates OpenAI-style chat requests to/from Anthropic's `messages` API.
- **Unified Bigliner API keys** (`bl_…`) that external apps can use without ever seeing your provider keys.
- **OAuth-style local app authorization** with client_id / client_secret, scopes, redirect URIs, token issuance & revocation.
- **Encrypted key vault** — provider keys are AES-256-GCM encrypted at rest using a master secret stored locally.
- **Persistent SQLite store** for providers, keys, routes, apps, tokens, request logs, and daily aggregates.
- **Analytics**: requests, tokens, cost, latency p50/p95/p99, fallback events, top expensive prompts, repeated prompt detector, "could be cheaper" simulator.
- **Token Saver**: configurable compression for verbose tool outputs and optional assistant outputs, powered by deterministic text compression.
- **Animated React dashboard** with aurora background, glass cards, live indicators, route simulator, playground, and dark glass UI.
- **Configurable privacy** — prompt logging is `preview`-only by default and can be set to `off`, `metadata`, or `full`.

## Quick start

```bash
cp .env.example .env
# Edit .env and set BIGLINER_PASSWORD
npm install
npm run build       # builds the web dashboard into web/dist
npm start           # starts the backend at http://localhost:9879
```

For local development with hot-reload (server + web):

```bash
npm run dev
# server: http://localhost:9879
# web dev server: http://127.0.0.1:5180 (proxies /api and /v1 to the server)
```

Sign in to the dashboard with the `BIGLINER_PASSWORD` you set in `.env`.

## VPS deployment from Git

Example production-style deployment from the GitHub repository:

```bash
mkdir -p /home/ubuntu/apps
git clone https://github.com/halucyyy/bigliner.git /home/ubuntu/apps/bigliner
cd /home/ubuntu/apps/bigliner

npm ci
npm run build

cat > .env <<'EOF'
BIGLINER_PASSWORD=<dashboard-password>
BIGLINER_MASTER_KEY=<long-random-master-key>
HOST=127.0.0.1
PORT=9879
NODE_ENV=production
BIGLINER_PROMPT_LOG_MODE=preview
EOF
chmod 600 .env
```

Systemd unit example:

```ini
[Unit]
Description=Bigliner AI Gateway
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/ubuntu/apps/bigliner
EnvironmentFile=/home/ubuntu/apps/bigliner/.env
Environment=PATH=/home/ubuntu/.local/bin:/home/ubuntu/.hermes/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStart=/home/ubuntu/.local/bin/npm run start -w server
Restart=always
RestartSec=5
User=ubuntu
Group=ubuntu

[Install]
WantedBy=multi-user.target
```

After installing the unit:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now bigliner
curl http://127.0.0.1:9879/api/health
```

## Calling the gateway

External apps authenticate with a unified Bigliner key (created on the **API Keys** page in the dashboard, default key seeded on first boot):

```bash
curl http://localhost:9879/v1/chat/completions \
  -H 'authorization: Bearer bl_YOUR_KEY' \
  -H 'content-type: application/json' \
  --data '{
    "model": "openai:gpt-5.5-mini",
    "messages": [{"role": "user", "content": "hello"}]
  }'
```

Bigliner inspects `model`, resolves it to a route, and forwards to the chosen provider using your encrypted provider key. The response is normalized to OpenAI's chat completion shape.

### Routing model strings

| Form                 | Example                  | Behaviour |
|----------------------|--------------------------|-----------|
| `provider:model`     | `openai:gpt-5.5`         | Direct lane to that provider/model. |
| Route alias          | `bigliner-cheap`         | Resolved through your alias chain. |
| Bare model id        | `claude-opus-4.7`        | Looked up in the model registry; falls back to default route. |
| Default              | (empty / unknown)        | Routes through the default route (`bigliner-smart` by default). |

Default aliases seeded on first boot: `bigliner-smart`, `bigliner-fast`, `bigliner-cheap`, `bigliner-vision`, `bigliner-local`.

## Dashboard pages

| Page | Purpose |
|---|---|
| **Overview** | High-level system status, traffic chart, cost insights, fallback feed. |
| **Providers** | All 100+ providers with filters (status / capability / category). |
| **Provider detail** | Per-provider model list, keys (add / enable / delete), test connection. |
| **Routes** | Create prefix / alias / fallback routes. Live route simulator. |
| **Playground** | Send test requests, inspect route decision, see cost, generate `curl`. |
| **Usage** | Per-provider / model / app analytics, charts, CSV export. |
| **Logs** | Request log viewer with filters and detail drawer (fallback chain, prompt preview). |
| **API Keys** | Create / rotate / revoke unified `bl_…` keys, scoped to routes/models with optional rate limit. |
| **OAuth Login** | Register local apps, approve them, issue short-lived tokens. |
| **OAuth Manage** | Manage apps + tokens, rotate client secrets. |
| **Auth JSON** | Import / export auth config as JSON (secrets redacted unless explicitly opted in). |
| **Settings** | Password, default route, Token Saver, prompt-log mode, retention, runtime info, danger-zone reset. |

## Documentation

- [docs/PROVIDERS.md](docs/PROVIDERS.md) — provider registry, statuses, adding a custom provider.
- [docs/ROUTING.md](docs/ROUTING.md) — route engine, aliases, fallback chains, conditions.
- [docs/OAUTH.md](docs/OAUTH.md) — local app auth flow, scopes, tokens.
- [docs/SECURITY.md](docs/SECURITY.md) — encryption, secrets handling, privacy modes.
- [docs/API.md](docs/API.md) — HTTP endpoint reference (`/api/*` and `/v1/*`).

## Privacy

Bigliner does not phone home. There is **no analytics telemetry to third parties**, no hidden external calls, and prompt content stays on your machine. The default prompt log mode is `preview` (short snippet only); switch it to `metadata` or `off` if you want even less. See [`docs/SECURITY.md`](docs/SECURITY.md).

## Project layout

```
bigliner/
  server/                # Node + Express backend
    src/
      adapters/          # OpenAI + Anthropic provider adapters
      db/                # SQLite schema + connection
      lib/               # crypto + id helpers
      registry/          # static provider registry (100+ providers)
      routes/            # /api/* and /v1/* HTTP route handlers
      services/          # auth, key vault, route engine, analytics, gateway, …
      config.js
      index.js           # server entrypoint
    test/                # node:test smoke tests
  web/                   # React + Vite + Tailwind + Framer Motion dashboard
  docs/                  # extra reference docs
  .env.example           # template; copy to .env (never commit .env)
  package.json           # workspace root
```

## Scripts

- `npm run dev` — run server (with `--watch`) and the Vite dev server in parallel.
- `npm run build` — build the web dashboard into `web/dist`.
- `npm start` — build the web bundle and run the production-style server (serves API + static UI from one port).
- `npm test` — run Node's built-in test runner against `server/test/**/*.test.js`.
- `npm run lint` — quick syntax check (`node --check`) plus the web lint.

## Acceptance criteria

This rebuild covers all 15 items in the brief — local-first runtime, password login, ≥100-entry registry, masked & persisted keys, unified `bl_…` API keys, real OpenAI-compatible forwarding, Anthropic adapter, route builder, real logs, real usage, playground, settings, polished animated UI, no committed secrets, README + docs ready.

## Roadmap

- Streaming relay for SSE clients
- Native adapters for Cohere, Bedrock, Vertex AI
- Optional Docker image
- Cache layer for repeated prompts
- Per-key webhook notifications

## Hugging Face Spaces demo deployment

Bigliner can run as a Docker Space for demos. Keep real secrets in Space secrets, not in the repository.

Recommended Space variables/secrets:

```text
BIGLINER_PASSWORD=<dashboard-password>
BIGLINER_MASTER_KEY=<long-random-master-key>
HOST=0.0.0.0
PORT=7860
BIGLINER_PROMPT_LOG_MODE=preview
```

The included `Dockerfile` builds the web dashboard and starts the server on the Hugging Face Spaces default port.

## License

MIT
