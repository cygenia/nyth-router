<div align="center">
  <img src="web/public/brand/nyth-logo-transparent.png" alt="Nyth logo" width="160" />

  <h1>Nyth</h1>

  <p>
    Private model workspace for running many AI providers behind one local, OpenAI-compatible API.
    Nyth gives you a clean dashboard, unified app keys, routing, fallback paths, usage visibility,
    and a local encrypted vault for provider credentials.
  </p>

  <p>
    Install it on a laptop, workstation, home server, cloud VM, VPS, or any Linux box that can run Node.js.
  </p>
</div>

Dashboard URL after install:

```text
http://localhost:9879/
```

LLM base URL:

```text
http://localhost:9879/v1
```

Use this base URL in OpenAI-compatible clients, with a unified key created from the Nyth dashboard.

## Why Nyth

- One local `/v1/chat/completions` endpoint for your apps.
- One unified key per app, separate from provider API keys.
- Provider and model registry with route builder.
- Fallback routes when a provider is unavailable.
- Usage, cost, latency, request logs, and token visibility.
- Prompt logging controls: `off`, `metadata`, `preview`, or `full`.
- Local SQLite storage with encrypted provider-key vault.
- Works without sending provider credentials to any hosted control plane.


## Requirements

- Node.js 20 or newer.
- npm 10 or newer.
- Git.

Check versions:

```bash
node --version
npm --version
git --version
```

## Manual installation from terminal

```bash
git clone https://github.com/cygenia/nyth-router.git
cd nyth-router
cp .env.example .env
```

Open `.env` and set a dashboard password before first login:

```text
NYTH_PASSWORD=<choose-a-password-at-least-15-characters>
HOST=localhost
PORT=9879
PUBLIC_BASE_URL=http://localhost:9879
```

Install, build, and start:

```bash
npm ci
npm run build
npm start
```

Open:

```text
http://localhost:9879/
```

Login with the `NYTH_PASSWORD` you placed in `.env`.

## Manual installation from VS Code

1. Open VS Code.
2. Clone the repository with `Git: Clone`, or open a VS Code terminal and run:

   ```bash
   git clone https://github.com/cygenia/nyth-router.git
   cd nyth-router
   ```

3. Copy the environment template:

   ```bash
   cp .env.example .env
   ```

4. Edit `.env` in VS Code and set:

   ```text
   NYTH_PASSWORD=<choose-a-password-at-least-15-characters>
   HOST=localhost
   PORT=9879
   PUBLIC_BASE_URL=http://localhost:9879
   ```

5. Install and start:

   ```bash
   npm ci
   npm run build
   npm start
   ```

6. Open `http://localhost:9879/` and login with your dashboard password.

## Development mode

Run backend and Vite frontend together:

```bash
npm install
npm run dev
```

Development note:

- `npm run dev` starts the backend and the Vite frontend hot-reload server for local development only.
- Installed/production usage stays on `http://localhost:9879/`.
- OpenAI-compatible LLM base URL stays `http://localhost:9879/v1`.

## Environment variables

Minimum `.env`:

```text
NYTH_PASSWORD=<choose-a-password-at-least-15-characters>
HOST=localhost
PORT=9879
PUBLIC_BASE_URL=http://localhost:9879
```

Optional `.env`:

```text
NYTH_MASTER_KEY=<long-random-master-key>
NYTH_DB_PATH=
NYTH_LOG_RETENTION_DAYS=30
NYTH_PROMPT_LOG_MODE=preview
NODE_ENV=production
```

Notes:

- `NYTH_PASSWORD` is required for dashboard login. Use at least 15 characters.
- `NYTH_MASTER_KEY` encrypts provider credentials at rest. If omitted, Nyth creates `server/data/master.key` locally.
- Keep `.env` private. It is ignored by Git and must never be uploaded.

## First dashboard setup

1. Login with `NYTH_PASSWORD`.
2. Add provider credentials in Providers, or configure a local/self-hosted provider.
3. Create or adjust routes in Routes.
4. Create a unified application key in API Keys.
5. Test prompts in Playground.
6. Monitor activity in Usage and Logs.

No provider credentials or connected accounts are included by default.

## Calling Nyth from an app

Create a unified key in the dashboard, then use this OpenAI-compatible LLM base URL:

```text
http://localhost:9879/v1
```

Example chat completion request:

```bash
curl http://localhost:9879/v1/chat/completions \
  -H 'authorization: Bearer <your-local-app-key>' \
  -H 'content-type: application/json' \
  --data '{
    "model": "nyth-smart",
    "messages": [{"role": "user", "content": "hello"}]
  }'
```

Nyth resolves the route alias, forwards the request to a configured provider, and normalizes the response.

## Default route aliases

A fresh install seeds route aliases such as:

- `nyth-smart`
- `nyth-fast`
- `nyth-cheap`
- `nyth-vision`
- `nyth-local`

Edit them from the Routes page after adding providers.

## Project layout

```text
nyth-router/
  server/                Node + Express backend
    src/
      adapters/          Provider adapters
      db/                SQLite schema + connection
      lib/               Encryption + ID helpers
      registry/          Provider/model registry
      routes/            HTTP route handlers
      services/          Auth, vault, routing, analytics, gateway
      index.js           Server entrypoint
    test/                Node test suite
  web/                   React + Vite + Tailwind dashboard
  docs/                  Reference docs
  scripts/               Maintenance and safety scripts
  .env.example           Environment template
  package.json           Workspace root
```

## Scripts

```bash
npm run dev      # backend + Vite dev server
npm run build    # build dashboard into web/dist
npm start        # build dashboard and run production server
npm test         # run server tests
npm run lint     # syntax/lint checks
```

## Linux service example

Example systemd unit for a Linux server. Adjust paths and user to your machine.

```ini
[Unit]
Description=Nyth
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/nyth-router
EnvironmentFile=/opt/nyth-router/.env
ExecStart=/usr/bin/npm run start -w server
Restart=always
RestartSec=5
User=ubuntu
Group=ubuntu

[Install]
WantedBy=multi-user.target
```

Then open through your own tunnel/reverse proxy, or locally with:

```text
http://localhost:9879/
```


## License

MIT
