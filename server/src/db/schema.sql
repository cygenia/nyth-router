-- Bigliner SQLite schema
-- Each statement is idempotent so it can run on every boot.

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  format TEXT NOT NULL,
  base_url TEXT NOT NULL,
  auth_type TEXT NOT NULL DEFAULT 'bearer',
  capabilities TEXT NOT NULL DEFAULT '[]',
  docs_url TEXT,
  status TEXT NOT NULL DEFAULT 'metadata',
  enabled INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_keys (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  label TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  masked_key TEXT NOT NULL,
  base_url_override TEXT,
  default_model TEXT,
  priority INTEGER NOT NULL DEFAULT 100,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_error TEXT,
  last_used_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_provider_keys_provider ON provider_keys(provider_id);

CREATE TABLE IF NOT EXISTS models (
  provider_id TEXT NOT NULL,
  id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  context_length INTEGER,
  input_price REAL,
  output_price REAL,
  capabilities TEXT NOT NULL DEFAULT '[]',
  release_status TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  metadata_only INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (provider_id, id),
  FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_models_provider ON models(provider_id);

CREATE TABLE IF NOT EXISTS routes (
  id TEXT PRIMARY KEY,
  alias TEXT UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  strategy TEXT NOT NULL DEFAULT 'priority',
  conditions TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS route_steps (
  id TEXT PRIMARY KEY,
  route_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  provider_id TEXT NOT NULL,
  model_id TEXT,
  fallback_on TEXT NOT NULL DEFAULT '["error","rate_limit","timeout"]',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_route_steps_route ON route_steps(route_id);

CREATE TABLE IF NOT EXISTS apps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  client_id TEXT UNIQUE NOT NULL,
  client_secret_hash TEXT NOT NULL,
  redirect_uris TEXT NOT NULL DEFAULT '[]',
  scopes TEXT NOT NULL DEFAULT '["chat:read","chat:write"]',
  status TEXT NOT NULL DEFAULT 'active',
  last_used_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS app_tokens (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  token_prefix TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT '[]',
  expires_at INTEGER,
  revoked INTEGER NOT NULL DEFAULT 0,
  last_used_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_app_tokens_app ON app_tokens(app_id);
CREATE INDEX IF NOT EXISTS idx_app_tokens_hash ON app_tokens(token_hash);

CREATE TABLE IF NOT EXISTS unified_api_keys (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  rate_limit_per_min INTEGER,
  allowed_routes TEXT NOT NULL DEFAULT '[]',
  allowed_models TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  last_used_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_unified_keys_hash ON unified_api_keys(key_hash);

CREATE TABLE IF NOT EXISTS request_logs (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  app_id TEXT,
  app_name TEXT,
  unified_key_id TEXT,
  route_id TEXT,
  route_alias TEXT,
  provider_id TEXT,
  model TEXT,
  requested_model TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost REAL NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ok',
  error_reason TEXT,
  fallback_chain TEXT NOT NULL DEFAULT '[]',
  prompt_preview TEXT,
  response_preview TEXT,
  endpoint TEXT,
  streaming INTEGER NOT NULL DEFAULT 0,
  request_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_logs_ts ON request_logs(ts);
CREATE INDEX IF NOT EXISTS idx_logs_provider ON request_logs(provider_id);
CREATE INDEX IF NOT EXISTS idx_logs_app ON request_logs(app_id);
CREATE INDEX IF NOT EXISTS idx_logs_status ON request_logs(status);

CREATE TABLE IF NOT EXISTS fallback_events (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  from_provider TEXT,
  to_provider TEXT,
  reason TEXT,
  step_index INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_fallback_request ON fallback_events(request_id);

CREATE TABLE IF NOT EXISTS usage_daily (
  day TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  model TEXT NOT NULL,
  app_id TEXT,
  request_count INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost REAL NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, provider_id, model, app_id)
);

CREATE INDEX IF NOT EXISTS idx_usage_day ON usage_daily(day);

CREATE TABLE IF NOT EXISTS prompt_fingerprints (
  id TEXT PRIMARY KEY,
  fingerprint TEXT UNIQUE NOT NULL,
  preview TEXT,
  hits INTEGER NOT NULL DEFAULT 1,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost REAL NOT NULL DEFAULT 0,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fingerprint ON prompt_fingerprints(fingerprint);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
