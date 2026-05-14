import db from '../db/connection.js';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { sessionToken, prefixedId, unifiedKey, appToken, clientSecret } from '../lib/id.js';
import { hashPassword, verifyPassword, maskSecret, encryptSecret, decryptSecret } from '../lib/crypto.js';

const settingsGet = db.prepare('SELECT value FROM settings WHERE key = ?');
const settingsUpsert = db.prepare(`
  INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
`);

export function getDashboardPasswordHash() {
  const row = settingsGet.get('dashboard_password_hash');
  return row?.value || null;
}

export const MIN_DASHBOARD_PASSWORD_LENGTH = 15;

export function validateDashboardPassword(plain) {
  const password = String(plain || '');
  return password.length >= MIN_DASHBOARD_PASSWORD_LENGTH;
}

export function setDashboardPassword(plain) {
  if (!validateDashboardPassword(plain)) return false;
  settingsUpsert.run('dashboard_password_hash', hashPassword(plain), Date.now());
  return true;
}

export function ensureDefaultPassword() {
  // If no password is stored but NYTH_PASSWORD is set, seed it.
  const existing = getDashboardPasswordHash();
  if (existing) return;
  if (config.password) {
    if (!setDashboardPassword(config.password)) {
      throw new Error('dashboard_password_min_15_chars');
    }
  }
}

export function checkDashboardPassword(plain) {
  const hash = getDashboardPasswordHash();
  if (!hash) {
    if (config.password && plain === config.password) return true;
    return false;
  }
  return verifyPassword(plain, hash);
}

export const DASHBOARD_SESSION_DURATIONS = Object.freeze({
  never: 1000 * 60 * 5,
  '30m': 1000 * 60 * 30,
  '1h': 1000 * 60 * 60,
  '6h': 1000 * 60 * 60 * 6,
  '24h': 1000 * 60 * 60 * 24,
  remember: null,
});

export function normalizeSessionDuration(duration) {
  return Object.hasOwn(DASHBOARD_SESSION_DURATIONS, duration) ? duration : 'remember';
}

function sessionExpiresAt(duration) {
  const ttl = DASHBOARD_SESSION_DURATIONS[duration];
  return ttl === null ? null : Date.now() + ttl;
}

export function createSession(duration = 'remember') {
  const normalizedDuration = normalizeSessionDuration(duration);
  const id = sessionToken();
  const expiresAt = sessionExpiresAt(normalizedDuration);
  db.prepare('INSERT INTO sessions (id, expires_at, duration, created_at) VALUES (?, ?, ?, ?)').run(id, expiresAt, normalizedDuration, Date.now());
  return { id, expiresAt, duration: normalizedDuration };
}

export function touchSession(id) {
  if (!id) return null;
  const row = db.prepare('SELECT expires_at, duration FROM sessions WHERE id = ?').get(id);
  if (!row) return null;
  if (row.expires_at !== null && row.expires_at < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
    return null;
  }
  const duration = normalizeSessionDuration(row.duration);
  const next = sessionExpiresAt(duration);
  db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(next, id);
  return { id, expiresAt: next, duration };
}

export function deleteSession(id) {
  if (!id) return;
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

// ---------- OAuth-style local apps ----------

export function listApps() {
  return db.prepare(`
    SELECT id, name, description, client_id AS clientId, redirect_uris AS redirectUris,
           scopes, status, last_used_at AS lastUsedAt, created_at AS createdAt, updated_at AS updatedAt
    FROM apps ORDER BY created_at DESC
  `).all().map((row) => ({
    ...row,
    redirectUris: safeJson(row.redirectUris, []),
    scopes: safeJson(row.scopes, []),
  }));
}

export function createApp({ name, description, redirectUris, scopes }) {
  const id = prefixedId('app');
  const cid = prefixedId('cid');
  const cs = clientSecret();
  const now = Date.now();
  db.prepare(`
    INSERT INTO apps (id, name, description, client_id, client_secret_hash, redirect_uris, scopes, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `).run(
    id,
    name || 'Untitled app',
    description || '',
    cid,
    hashPassword(cs),
    JSON.stringify(redirectUris || []),
    JSON.stringify(scopes || ['chat:read', 'chat:write']),
    now,
    now,
  );
  return { id, clientId: cid, clientSecret: cs, name };
}

export function rotateClientSecret(appId) {
  const cs = clientSecret();
  db.prepare('UPDATE apps SET client_secret_hash = ?, updated_at = ? WHERE id = ?').run(
    hashPassword(cs), Date.now(), appId,
  );
  return cs;
}

export function deleteApp(appId) {
  db.prepare('DELETE FROM apps WHERE id = ?').run(appId);
  return { ok: true };
}

export function issueAppToken({ appId, scopes, ttlSeconds }) {
  const t = appToken();
  const id = prefixedId('tok');
  const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
  db.prepare(`
    INSERT INTO app_tokens (id, app_id, token_hash, token_prefix, scopes, expires_at, revoked, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
  `).run(
    id,
    appId,
    sha256(t),
    t.slice(0, 12),
    JSON.stringify(scopes || ['chat:read', 'chat:write']),
    expiresAt,
    Date.now(),
  );
  return { id, token: t, prefix: t.slice(0, 12), expiresAt };
}

export function listAppTokens(appId) {
  return db.prepare(`
    SELECT id, app_id AS appId, token_prefix AS tokenPrefix, scopes, expires_at AS expiresAt,
           revoked, last_used_at AS lastUsedAt, created_at AS createdAt
    FROM app_tokens WHERE app_id = ? ORDER BY created_at DESC
  `).all(appId).map((row) => ({ ...row, scopes: safeJson(row.scopes, []) }));
}

export function revokeAppToken(id) {
  db.prepare('UPDATE app_tokens SET revoked = 1 WHERE id = ?').run(id);
}

export function findAppByToken(token) {
  if (!token) return null;
  const hash = sha256(token);
  const row = db.prepare(`
    SELECT t.id AS tokenId, t.app_id AS appId, t.scopes AS scopes, t.revoked AS revoked,
           t.expires_at AS expiresAt, a.name AS appName, a.status AS appStatus
    FROM app_tokens t
    JOIN apps a ON a.id = t.app_id
    WHERE t.token_hash = ?
  `).get(hash);
  if (!row) return null;
  if (row.revoked) return null;
  if (row.expiresAt && row.expiresAt < Date.now()) return null;
  if (row.appStatus !== 'active') return null;
  db.prepare('UPDATE app_tokens SET last_used_at = ? WHERE id = ?').run(Date.now(), row.tokenId);
  db.prepare('UPDATE apps SET last_used_at = ? WHERE id = ?').run(Date.now(), row.appId);
  return {
    appId: row.appId,
    appName: row.appName,
    tokenId: row.tokenId,
    scopes: safeJson(row.scopes, []),
  };
}

// ---------- Unified Nyth Router API keys ----------

export function listUnifiedKeys() {
  return db.prepare(`
    SELECT id, label, key_prefix AS keyPrefix, masked_key AS maskedKey,
           rate_limit_per_min AS rateLimitPerMin,
           allowed_routes AS allowedRoutes, allowed_models AS allowedModels, enabled,
           last_used_at AS lastUsedAt, created_at AS createdAt, updated_at AS updatedAt
    FROM unified_api_keys ORDER BY created_at DESC
  `).all().map((row) => ({
    ...row,
    maskedKey: row.maskedKey || `${row.keyPrefix}••••`,
    allowedRoutes: safeJson(row.allowedRoutes, []),
    allowedModels: safeJson(row.allowedModels, []),
  }));
}

export function createUnifiedKey({ label, customKey, rateLimitPerMin, allowedRoutes, allowedModels }) {
  const candidate = String(customKey || '').trim();
  const t = candidate || unifiedKey();
  if (candidate && candidate.length < 12) throw new Error('custom_key_min_12_chars');
  const id = prefixedId('uk');
  const now = Date.now();
  db.prepare(`
    INSERT INTO unified_api_keys (id, label, key_hash, key_prefix, encrypted_key, masked_key, rate_limit_per_min, allowed_routes, allowed_models, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    id,
    label || candidate || 'Default unified key',
    sha256(t),
    t.slice(0, 8),
    encryptSecret(t),
    maskSecret(t),
    rateLimitPerMin || null,
    JSON.stringify(allowedRoutes || []),
    JSON.stringify(allowedModels || []),
    now,
    now,
  );
  return { id, key: t, prefix: t.slice(0, 8), masked: maskSecret(t) };
}

export function rotateUnifiedKey(id) {
  const t = unifiedKey();
  db.prepare(`
    UPDATE unified_api_keys SET key_hash = ?, key_prefix = ?, encrypted_key = ?, masked_key = ?, updated_at = ?
    WHERE id = ?
  `).run(sha256(t), t.slice(0, 8), encryptSecret(t), maskSecret(t), Date.now(), id);
  return { id, key: t, prefix: t.slice(0, 8), masked: maskSecret(t) };
}

export function revealUnifiedKey(id) {
  const row = db.prepare('SELECT id, encrypted_key AS encryptedKey FROM unified_api_keys WHERE id = ? AND enabled = 1').get(id);
  if (!row || !row.encryptedKey) return null;
  const key = decryptSecret(row.encryptedKey);
  if (!key) return null;
  return { id: row.id, key, prefix: key.slice(0, 8), masked: maskSecret(key) };
}

export function revokeUnifiedKey(id) {
  db.prepare('UPDATE unified_api_keys SET enabled = 0, updated_at = ? WHERE id = ?').run(Date.now(), id);
}

export function deleteUnifiedKey(id) {
  db.prepare('DELETE FROM unified_api_keys WHERE id = ?').run(id);
}

export function findUnifiedKey(token) {
  if (!token) return null;
  const hash = sha256(token);
  const row = db.prepare(`
    SELECT id, label, allowed_routes AS allowedRoutes, allowed_models AS allowedModels, enabled
    FROM unified_api_keys WHERE key_hash = ?
  `).get(hash);
  if (!row || !row.enabled) return null;
  db.prepare('UPDATE unified_api_keys SET last_used_at = ? WHERE id = ?').run(Date.now(), row.id);
  return {
    id: row.id,
    label: row.label,
    allowedRoutes: safeJson(row.allowedRoutes, []),
    allowedModels: safeJson(row.allowedModels, []),
  };
}

export function ensureDefaultUnifiedKey() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM unified_api_keys').get().c;
  if (count > 0) return null;
  return createUnifiedKey({ label: 'Default unified key' });
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function safeJson(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}
