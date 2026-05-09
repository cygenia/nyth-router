# Security

Bigliner is designed for private deployments. By default, the server binds to `127.0.0.1`, does not include telemetry, and stores secrets in an encrypted SQLite-backed vault.

## Threat model

Bigliner protects against:

- A compromised host **process** (not the host) reading provider keys directly from the database file.
- Accidentally committing secrets to source control.
- Leaking prompt content in logs.

Bigliner does **not** protect against:

- Full host compromise (an attacker with shell on your machine can read the master key).
- Malicious browser extensions in the same session as the dashboard.

If you need stronger guarantees, run Bigliner inside a hardened VM / container and store the master key in an external secret manager.

## Encryption at rest

Provider API keys, OAuth client secrets, and unified API key hashes are protected as follows:

- **Provider keys**: AES-256-GCM with a 32-byte key, stored as `iv | ciphertext | tag` (base64) in `provider_keys.encrypted_key`.
- **OAuth tokens / unified API keys**: SHA-256 hashed; the plaintext is shown to the user once on creation and never again.
- **Master key**: 32 random bytes (hex). Sourced from `BIGLINER_MASTER_KEY` if set; otherwise auto-generated to `server/data/master.key` on first boot. The file is created with mode `0600`.

The master key never leaves the machine. If you wipe `server/data/master.key`, all encrypted provider keys become unrecoverable — re-add them from the dashboard.

## Secrets handling

- `.env` is in `.gitignore`. **Never** commit it.
- Use `.env.example` for placeholders (see file).
- The dashboard only ever displays masked keys (`sk-…abcd`). Re-entering a key replaces it; you cannot view the plaintext after save.
- Bigliner refuses to log in with `BIGLINER_PASSWORD` empty.

## Prompt-log privacy

`Settings → Prompt log mode`:

| Mode        | Stored per request |
|-------------|--------------------|
| `off`       | Nothing (status / latency / cost only). |
| `metadata`  | Routes, providers, tokens, status, but no prompt or response text. |
| `preview` *(default)* | First 200 chars of prompt + first 200 chars of response. |
| `full`      | Entire prompt and response (use only for local debugging). |

Daily aggregates in `usage_daily` never store prompt content regardless of mode.

## Network privacy

- No outbound calls except the provider request you initiate.
- No analytics, telemetry, crash reporting, or update pings.
- The static asset bundle ships with the server; the dashboard never loads code from a CDN.

## Data retention

`Settings → Retention` controls how many days of `request_logs` and `fallback_events` Bigliner keeps. Older rows are purged on a daily sweep. Set to `0` to disable retention sweeps and keep logs forever.

## Reset / wipe

- **Settings → Danger zone → Reset database** deletes `server/data/bigliner.db` and re-runs migrations.
- Manually: stop the server, delete `server/data/bigliner.db` and `server/data/master.key`, restart.
