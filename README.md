# Bigliner

Local-first AI gateway control plane for multi-provider routing, custom API keys, and usage visibility.

Bigliner is a lightweight prototype for developers who use multiple OpenAI-compatible or Anthropic-compatible providers and want one local dashboard to manage provider lanes, custom base URLs, masked API keys, route telemetry, and cost-oriented usage views.

## Features

- Local dashboard with password gate
- OpenAI-compatible mock endpoint: `/v1/chat/completions`
- Provider lanes for OpenAI-compatible, Anthropic-compatible, local model, and custom endpoints
- CPA-style custom API key form
- Masked key display in the UI
- Request timeline and routing telemetry
- Clean command-center UI
- No bundled credentials

## Quick start

```bash
cp .env.example .env
# edit .env and set BIGLINER_PASSWORD
npm install
BIGLINER_PASSWORD="your-password" PORT=9879 npm start
```

Open:

```text
http://localhost:9879
```

Gateway endpoint:

```text
http://localhost:9879/v1/chat/completions
```

## Environment variables

| Variable | Required | Default | Description |
|---|---:|---|---|
| `BIGLINER_PASSWORD` | yes | none | Dashboard login password. The server refuses login if unset. |
| `PORT` | no | `9879` | HTTP port. |
| `HOST` | no | `localhost` | Bind host. Change only when you intentionally expose it. |

## Security notes

- Do not commit `.env`.
- Do not commit real provider API keys.
- This prototype stores custom keys in runtime memory only; persistence/encryption should be added before production use.
- Use a reverse proxy with TLS if exposing beyond localhost.

## API smoke test

```bash
curl http://localhost:9879/v1/chat/completions \
  -H 'content-type: application/json' \
  --data '{"model":"auto","messages":[{"role":"user","content":"hello"}]}'
```

## Roadmap

- Encrypted SQLite key vault
- Real provider forwarding for OpenAI-compatible APIs
- Anthropic adapter
- Key rotation policies
- Health checks
- Per-app local tokens
- Docker image
- Import/export configuration

## License

MIT
