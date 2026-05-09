# HTTP API reference

Bigliner exposes two surfaces:

- **`/v1/*`** — OpenAI-compatible gateway that external apps call.
- **`/api/*`** — control-plane endpoints that the dashboard (or your CLI) calls.

All endpoints return JSON unless noted.

## Auth

| Surface  | Auth                                                  |
|----------|-------------------------------------------------------|
| `/v1/*`  | `Authorization: Bearer bl_…` (unified key) **or** `Authorization: Bearer at_…` (OAuth token). |
| `/api/*` | Session cookie (`bigliner_sid`) issued by `/api/auth/login`. |

## Gateway endpoints (`/v1`)

### `POST /v1/chat/completions`

Same shape as OpenAI's Chat Completions API.

```bash
curl http://localhost:9879/v1/chat/completions \
  -H 'authorization: Bearer bl_…' \
  -H 'content-type: application/json' \
  --data '{
    "model": "openai:gpt-5.5-mini",
    "messages": [{"role":"user","content":"hi"}],
    "temperature": 0.2
  }'
```

Response (truncated):

```json
{
  "id": "chatcmpl-…",
  "object": "chat.completion",
  "model": "openai:gpt-5.5-mini",
  "choices": [{ "index": 0, "message": { "role":"assistant", "content":"…" }, "finish_reason":"stop" }],
  "usage": { "prompt_tokens": 7, "completion_tokens": 12, "total_tokens": 19 },
  "bigliner": {
    "route": "openai:gpt-5.5-mini",
    "provider": "openai",
    "model": "gpt-5.5-mini",
    "fallback_chain": [],
    "latency_ms": 482,
    "estimated_cost_usd": 0.000113
  }
}
```

### `GET /v1/models`

Returns the registry filtered by enabled providers/keys, in OpenAI's `models.list` shape.

### `POST /v1/embeddings`

OpenAI-compatible embeddings, routed identically to `/v1/chat/completions`. (Adapter is metadata-only for providers without an `embeddings` capability.)

## Control-plane endpoints (`/api`)

### Auth

| Method | Path                  | Body / notes |
|--------|-----------------------|--------------|
| POST   | `/api/auth/login`     | `{ password }` — returns `Set-Cookie: bigliner_sid=…`. |
| POST   | `/api/auth/logout`    | invalidates the current session. |
| GET    | `/api/auth/me`        | session info. |

### Providers

| Method | Path                                | Notes |
|--------|-------------------------------------|-------|
| GET    | `/api/providers`                    | list with status, keys masked. |
| GET    | `/api/providers/:id`                | provider detail + models. |
| POST   | `/api/providers`                    | create custom provider. |
| PATCH  | `/api/providers/:id`                | update name / baseUrl / enabled. |
| DELETE | `/api/providers/:id`                | only allowed for custom providers. |
| POST   | `/api/providers/:id/keys`           | `{ key, label?, priority? }`. |
| PATCH  | `/api/providers/:id/keys/:keyId`    | toggle enabled / priority / label. |
| DELETE | `/api/providers/:id/keys/:keyId`    | revoke key. |
| POST   | `/api/providers/:id/test`           | probe connectivity using highest-priority key. |

### Routes

| Method | Path                       | Notes |
|--------|----------------------------|-------|
| GET    | `/api/routes`              | list. |
| POST   | `/api/routes`              | create alias. |
| PATCH  | `/api/routes/:id`          | edit name / steps / conditions. |
| DELETE | `/api/routes/:id`          | delete. |
| POST   | `/api/routes/simulate`     | `{ model }` — returns the route the engine would pick. |

### API keys (unified `bl_…`)

| Method | Path                       | Notes |
|--------|----------------------------|-------|
| GET    | `/api/api-keys`            | list, masked. |
| POST   | `/api/api-keys`            | `{ name, scopes?, rate_limit? }` — returns plaintext **once**. |
| POST   | `/api/api-keys/:id/rotate` | returns new plaintext **once**. |
| DELETE | `/api/api-keys/:id`        | revoke. |

### OAuth

| Method | Path                               | Notes |
|--------|------------------------------------|-------|
| GET    | `/api/oauth/apps`                  | list registered apps. |
| POST   | `/api/oauth/apps`                  | `{ name, redirect_uri, scopes }`. |
| POST   | `/api/oauth/apps/:id/secret/rotate`| rotate `client_secret`. |
| POST   | `/api/oauth/authorize`             | approve a pending request. |
| POST   | `/api/oauth/tokens`                | issue token from approved auth code. |
| DELETE | `/api/oauth/tokens/:id`            | revoke. |

### Auth JSON

| Method | Path                       | Notes |
|--------|----------------------------|-------|
| GET    | `/api/auth-json`           | redacted export. |
| GET    | `/api/auth-json?include_secrets=1` | full export with `?confirm=local` flag (warning logged). |
| POST   | `/api/auth-json`           | import (validated against schema). |

### Usage & logs

| Method | Path                       | Notes |
|--------|----------------------------|-------|
| GET    | `/api/usage`               | aggregated metrics with `?from=&to=&group_by=`. |
| GET    | `/api/usage/export.csv`    | CSV download. |
| GET    | `/api/logs`                | request log list with filters. |
| GET    | `/api/logs/:id`            | full log entry incl. fallback chain + previews. |

### Settings

| Method | Path                       | Notes |
|--------|----------------------------|-------|
| GET    | `/api/settings`            | runtime + persisted settings. |
| PATCH  | `/api/settings`            | partial update. |
| POST   | `/api/settings/password`   | `{ current, next }`. |
| POST   | `/api/settings/reset-db`   | wipes SQLite (requires confirm token). |

### Health

| Method | Path                       | Notes |
|--------|----------------------------|-------|
| GET    | `/api/health`              | `{ ok: true, version, uptime_s }`. |
