# OAuth-style local app authorization

Nyth Router does **not** speak the public OAuth 2.0 grant flow against external IdPs. Instead it implements an OAuth-style local authorization flow so a developer can grant a local app access to Nyth Router without sharing provider keys.

## Flow

```
                          ┌──────────────────────┐
                          │  Nyth Router dashboard  │
                          │   (logged in user)   │
                          └─────────▲────────────┘
                                    │ 4. user approves
                                    │
┌────────────┐  1. /authorize  ┌─────┴──────┐  5. issues token
│  Local app │ ───────────────►│  Nyth Router  │ ──────────────────► local app
└────────────┘                 │   server   │
        │                      └────────────┘
        │  2. registers app  ▲       │
        │     (one-time)     │       │ 3. nyth stores
        │                    │       │    pending request
        └────────────────────┘       │
                                     ▼
                              SQLite: apps + app_tokens
```

1. **Register** the app once in **OAuth Login → Register app**. Nyth Router returns a `client_id` and `client_secret` (shown once).
2. The local app initiates an authorization request:
   ```
   GET /api/oauth/authorize
       ?client_id=...
       &redirect_uri=http://localhost:5173/callback
       &scope=chat:write,routes:use
   ```
3. The dashboard shows an approval screen for the logged-in user.
4. On approval, Nyth Router issues a token bound to that app and the requested scopes.
5. The token is delivered to the redirect URI as a fragment (`#token=...`) or, for CLI usage, displayed once in the dashboard.

## Scopes

| Scope             | Grants |
|-------------------|--------|
| `chat:read`       | Read chat completion logs the app generated. |
| `chat:write`      | Call `/v1/chat/completions` and `/v1/embeddings`. |
| `providers:read`  | List providers + masked keys. |
| `usage:read`      | Read usage analytics. |
| `routes:use`      | Resolve route aliases (`nyth-smart`, etc). |

Scopes are additive; tokens carry the union of granted scopes.

## Token lifecycle

- Tokens are short-lived by default (12h). Configurable per app.
- Tokens are stored hashed in `app_tokens`.
- Revoke any token from **OAuth Manage**.
- Rotate `client_secret` from the same page (existing tokens are invalidated).

## Difference from unified API keys

| Feature              | Unified `bl_...` key             | OAuth-style app token |
|----------------------|--------------------------------|------------------------|
| Authentication       | Static bearer token            | Issued via approval flow |
| Scope                | Routes / models / rate limit   | Fine-grained scopes |
| Rotation             | Manual                         | TTL + revocation |
| Audit                | Per-key usage in dashboard     | Per-app usage in **OAuth Manage** |
| Best for             | Server-side scripts / CI       | Local apps / personal tools |

## Endpoints

- `POST /api/oauth/apps` - register
- `GET  /api/oauth/apps` - list
- `POST /api/oauth/apps/:id/secret/rotate`
- `POST /api/oauth/authorize`
- `POST /api/oauth/tokens` - issue
- `DELETE /api/oauth/tokens/:id` - revoke
