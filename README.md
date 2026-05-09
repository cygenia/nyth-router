# Bigliner

Bigliner is an AI gateway for routing requests across multiple model providers with unified authentication, fallback routing, usage analytics, and operational visibility.

It gives teams one application-facing API surface while provider keys, route policies, logs, and cost controls are managed from a single dashboard.

```
┌──────────┐    bl_********   ┌──────────────┐    provider keys    ┌────────────┐
│  Apps    │ ───────────────► │   Bigliner   │ ───────────────────►│  OpenAI    │
│ Services │                  │  AI Gateway  │                     │  Anthropic │
└──────────┘                  └──────────────┘                     │  Gemini    │
                                  ▲   ▲                            │  Groq      │
                              dashboard │                          │  Mistral   │
                              + logs    │                          │  Ollama    │
                                        └─ encrypted SQLite vault  │  …         │
                                                                   └────────────┘
```

## Highlights

- Multi-provider routing: manage OpenAI-compatible and Anthropic-compatible traffic from one gateway.
- Unified API keys: issue scoped `bl_…` keys for applications without exposing provider credentials.
- Route builder: configure prefix routes, aliases, default routes, fallback chains, and model selection rules.
- Provider registry: 100+ providers and 175+ models with capability, category, and status metadata.
- Usage analytics: requests, tokens, estimated cost, latency percentiles, fallback events, expensive prompts, and repeated prompt detection.
- Token Saver: optional compression for verbose tool outputs and assistant outputs with configurable safety modes.
- Playground: test prompts, inspect route decisions, generate cURL examples, and compare estimated cost.
- OAuth-style app authorization: register apps, approve scopes, issue tokens, revoke access, and rotate client secrets.
- Encrypted key vault: provider keys are encrypted at rest with AES-256-GCM using a deployment master key.
- Privacy controls: prompt logging can be set to `off`, `metadata`, `preview`, or `full`.
- Dashboard: React interface with provider management, routes, logs, API keys, auth JSON import/export, settings, and operational charts.

## Quick start

```bash
cp .env.example .env
# Edit .env and set BIGLINER_PASSWORD and BIGLINER_MASTER_KEY
npm install
npm run build
npm start
```

Default server:

```text
http://127.0.0.1:9879
```

Sign in to the dashboard with the configured `BIGLINER_PASSWORD`.

## Configuration

Minimum `.env`:

```text
BIGLINER_PASSWORD=<dashboard-password>
BIGLINER_MASTER_KEY=<long-random-master-key>
HOST=127.0.0.1
PORT=9879
NODE_ENV=production
BIGLINER_PROMPT_LOG_MODE=preview
```

Prompt log modes:

- `off`: store no prompt content.
- `metadata`: store metadata only.
- `preview`: store a short preview snippet.
- `full`: store full prompt content.

## VPS deployment from Git

Example deployment from the GitHub repository:

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
ExecStart=/usr/bin/npm run start -w server
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

For public access, place Bigliner behind a reverse proxy or tunnel and enable HTTPS.

## Calling the gateway

Applications authenticate with a unified Bigliner key created from the API Keys page.

```bash
curl http://127.0.0.1:9879/v1/chat/completions \
  -H 'authorization: Bearer bl_your_key' \
  -H 'content-type: application/json' \
  --data '{
    "model": "openai:gpt-5.5-mini",
    "messages": [{"role": "user", "content": "hello"}]
  }'
```

Bigliner resolves the model or route alias, forwards the request to the selected provider, and normalizes the response to an OpenAI-compatible chat completion shape.

## Routing model strings

| Form | Example | Behavior |
|---|---|---|
| `provider:model` | `openai:gpt-5.5` | Direct route to that provider and model. |
| Route alias | `bigliner-cheap` | Resolves through the configured alias chain. |
| Bare model id | `claude-opus-4.7` | Looks up the model registry, then falls back to the default route if needed. |
| Empty / unknown | empty model field | Uses the configured default route. |

Default aliases seeded on first boot:

- `bigliner-smart`
- `bigliner-fast`
- `bigliner-cheap`
- `bigliner-vision`
- `bigliner-local`

## Dashboard pages

| Page | Purpose |
|---|---|
| Overview | System status, traffic range selector, cost insights, latency, fallback feed. |
| Providers | Provider registry with status, capability, and category filters. |
| Provider detail | Model list, provider keys, add/enable/delete key actions, connection test. |
| Routes | Prefix routes, aliases, fallback routes, and route simulator. |
| Playground | Test requests, inspect route decision, see estimated cost, generate cURL. |
| Usage | Provider/model/app analytics, charts, and CSV export. |
| Logs | Request log viewer with filters and request detail drawer. |
| API Keys | Create, rotate, revoke, scope, and rate-limit unified keys. |
| OAuth Login | Register apps, approve scopes, and issue tokens. |
| OAuth Manage | Manage apps and tokens, rotate client secrets. |
| Auth JSON | Import/export auth configuration with secret redaction. |
| Settings | Password, default route, Token Saver, prompt logging, retention, runtime info, reset controls. |

## Token Saver

Token Saver can reduce context size before requests are forwarded:

- Compress tool output.
- Optionally compress assistant output.
- Select safety mode: safe, balanced, or aggressive.
- Limit maximum tool-output characters.
- Track before/after token estimates in gateway metadata.

This is useful for agent workflows where verbose command output, logs, stack traces, or repeated context can inflate token usage.

## Documentation

- `docs/PROVIDERS.md` — provider registry, statuses, and custom provider notes.
- `docs/ROUTING.md` — route engine, aliases, fallback chains, and conditions.
- `docs/OAUTH.md` — app authorization flow, scopes, and token handling.
- `docs/SECURITY.md` — encryption, secrets handling, and prompt logging modes.
- `docs/API.md` — HTTP endpoint reference for `/api/*` and `/v1/*`.

## Project layout

```text
bigliner/
  server/                # Node + Express backend
    src/
      adapters/          # Provider adapters
      db/                # SQLite schema + connection
      lib/               # Crypto + ID helpers
      registry/          # Provider/model registry
      routes/            # HTTP route handlers
      services/          # Auth, vault, routing, analytics, gateway, token saver
      index.js           # Server entrypoint
    test/                # Node test suite
  web/                   # React + Vite + Tailwind dashboard
  docs/                  # Reference docs
  .env.example           # Environment template
  package.json           # Workspace root
```

## Scripts

- `npm run dev` — run server and Vite dev server in parallel.
- `npm run build` — build the web dashboard into `web/dist`.
- `npm start` — run the production server from the server workspace.
- `npm test` — run the Node test suite.
- `npm run lint` — run syntax checks and web lint.

## Roadmap

- Streaming relay for SSE clients.
- Additional native provider adapters.
- Docker image publishing.
- Response cache and repeated prompt optimization.
- Per-key webhook notifications.

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
