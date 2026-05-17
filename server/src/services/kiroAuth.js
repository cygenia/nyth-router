import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import Database from 'better-sqlite3';

const KIRO_AUTH_SERVICE = 'https://prod.us-east-1.auth.desktop.kiro.dev';
const CODEWHISPERER_ENDPOINT = 'https://codewhisperer.us-east-1.amazonaws.com';
const KIRO_REFRESH_TOKEN_PREFIX = 'aorAAAAAG';

export function isKiroRefreshToken(value) {
  return String(value || '').trim().startsWith(KIRO_REFRESH_TOKEN_PREFIX);
}

export async function refreshKiroToken(refreshToken) {
  const token = String(refreshToken || '').trim();
  if (!isKiroRefreshToken(token)) {
    throw new Error('invalid_kiro_refresh_token_format');
  }
  const res = await fetch(`${KIRO_AUTH_SERVICE}/refreshToken`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ refreshToken: token }),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  const data = safeJson(text, { raw: text.slice(0, 500) });
  if (!res.ok || !data.accessToken) {
    const message = sanitizeKiroError(data) || `kiro_refresh_http_${res.status}`;
    throw new Error(message);
  }
  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken || token,
    profileArn: data.profileArn || null,
    expiresIn: Number(data.expiresIn || 3600),
    tokenType: data.tokenType || 'Bearer',
  };
}

export async function listKiroModels({ accessToken, profileArn, signal } = {}) {
  if (!accessToken) return { ok: false, status: 0, error: 'missing_kiro_access_token' };
  const res = await fetch(CODEWHISPERER_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-amz-json-1.0',
      accept: 'application/json',
      authorization: `Bearer ${accessToken}`,
      'x-amz-target': 'AmazonCodeWhispererService.ListAvailableModels',
    },
    body: JSON.stringify({ origin: 'AI_EDITOR', profileArn: profileArn || undefined }),
    signal,
  });
  const text = await res.text();
  const data = safeJson(text, { raw: text.slice(0, 1000) });
  if (!res.ok) return { ok: false, status: res.status, error: sanitizeKiroError(data), data };
  const models = normalizeKiroModels(data);
  return { ok: true, status: res.status, data: { data: models.map((model) => ({ id: model.id, ...model })) }, models };
}

export async function autoDetectKiroRefreshToken() {
  const browser = await autoDetectKiroRefreshTokenFromBrowserCookie();
  if (browser.found) return browser;

  const cachePath = join(homedir(), '.aws/sso/cache');
  let files;
  try {
    files = await readdir(cachePath);
  } catch {
    return { found: false, error: browser.error || 'Kiro token source not found. Login to app.kiro.dev in a local browser profile, or paste the Kiro refresh token manually.' };
  }
  const candidates = ['kiro-auth-token.json', ...files.filter((file) => file.endsWith('.json'))];
  const seen = new Set();
  for (const file of candidates) {
    if (seen.has(file)) continue;
    seen.add(file);
    try {
      const content = await readFile(join(cachePath, file), 'utf8');
      const data = JSON.parse(content);
      if (isKiroRefreshToken(data.refreshToken)) {
        return { found: true, refreshToken: data.refreshToken, source: file, sourceType: 'cache-file' };
      }
    } catch {
      // Skip unreadable or invalid cache entries.
    }
  }
  return { found: false, error: browser.error || 'Kiro refresh token not found in browser cookies or local cache. Login to app.kiro.dev, then run browser cookie repair.' };
}

export async function autoDetectKiroRefreshTokenFromBrowserCookie() {
  const paths = candidateCookieDbPaths();
  const errors = [];
  for (const dbPath of paths) {
    try {
      await stat(dbPath);
    } catch {
      continue;
    }
    const result = await readKiroRefreshTokenFromCookieDb(dbPath);
    if (result.found) {
      await writeKiroTokenCache(result.refreshToken, { source: result.source });
      return result;
    }
    if (result.error) errors.push(`${basename(dirname(dbPath))}/${basename(dbPath)}: ${result.error}`);
  }
  return { found: false, error: errors[0] || 'No readable browser cookie database with app.kiro.dev refreshToken was found.' };
}

export function decodeKiroIdentity(accessToken) {
  const payload = decodeJwtPayload(accessToken);
  const candidates = collectIdentityCandidates(payload);
  const email = candidates.find(isEmailLike) || null;
  const username = candidates.find(Boolean) || null;
  const subject = payload?.sub || payload?.account || payload?.username || payload?.userId || null;
  const label = email || username || (subject ? `kiro:${String(subject).slice(0, 8)}` : 'Kiro account');
  return { email, subject, label, rawClaims: summarizeIdentityClaims(payload) };
}

function collectIdentityCandidates(payload) {
  if (!payload || typeof payload !== 'object') return [];
  return [
    payload.email,
    payload.preferred_username,
    payload.username,
    payload.upn,
    payload['cognito:username'],
    payload['custom:email'],
    payload.identities?.[0]?.userId,
    payload.identities?.[0]?.providerName,
  ].map((value) => String(value || '').trim()).filter(Boolean);
}

function isEmailLike(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function summarizeIdentityClaims(payload) {
  if (!payload || typeof payload !== 'object') return {};
  const out = {};
  for (const key of ['email', 'preferred_username', 'username', 'upn', 'sub', 'account', 'userId', 'iss']) {
    if (payload[key]) out[key] = key === 'sub' ? String(payload[key]).slice(0, 12) : String(payload[key]);
  }
  return out;
}

function candidateCookieDbPaths() {
  const home = homedir();
  const explicit = String(process.env.KIRO_COOKIE_DB_PATH || process.env.NYTH_KIRO_COOKIE_DB || '').split(':').map((p) => p.trim()).filter(Boolean);
  const roots = [
    join(home, '.config/google-chrome'),
    join(home, '.config/chromium'),
    join(home, '.config/microsoft-edge'),
    join(home, '.config/BraveSoftware/Brave-Browser'),
    join(home, 'snap/chromium/common/chromium'),
  ];
  const profiles = ['Default', 'Profile 1', 'Profile 2', 'Profile 3', 'Profile 4', 'Profile 5'];
  const discovered = [];
  for (const root of roots) {
    for (const profile of profiles) {
      discovered.push(join(root, profile, 'Network/Cookies'));
      discovered.push(join(root, profile, 'Cookies'));
    }
  }
  return [...new Set([...explicit, ...discovered])];
}

async function readKiroRefreshTokenFromCookieDb(dbPath) {
  const tmpDir = await mkdtemp(join(tmpdir(), 'nyth-kiro-cookie-'));
  const tmpDb = join(tmpDir, 'Cookies');
  try {
    await copyFile(dbPath, tmpDb);
    const db = new Database(tmpDb, { readonly: true, fileMustExist: true });
    try {
      const rows = db.prepare(`
        SELECT host_key AS hostKey, name, value, encrypted_value AS encryptedValue, expires_utc AS expiresUtc, last_access_utc AS lastAccessUtc, creation_utc AS creationUtc
        FROM cookies
        WHERE host_key LIKE '%kiro.dev%'
        ORDER BY last_access_utc DESC, creation_utc DESC
      `).all();
      for (const row of rows) {
        const plain = String(row.value || '').trim();
        if (isKiroRefreshToken(plain) && isLikelyRefreshCookie(row.name)) {
          return { found: true, refreshToken: plain, source: `browser-cookie:${dbPath}`, sourceType: 'browser-cookie', cookieName: row.name, host: row.hostKey };
        }
      }
      for (const row of rows) {
        const plain = String(row.value || '').trim();
        if (isKiroRefreshToken(plain)) {
          return { found: true, refreshToken: plain, source: `browser-cookie:${dbPath}`, sourceType: 'browser-cookie', cookieName: row.name, host: row.hostKey };
        }
      }
      const encryptedCount = rows.filter((row) => row.encryptedValue && row.encryptedValue.length).length;
      return { found: false, error: encryptedCount ? 'cookie exists but encrypted browser values cannot be decrypted by this service user' : 'no Kiro refresh token cookie' };
    } finally {
      db.close();
    }
  } catch (err) {
    return { found: false, error: String(err.message || err).slice(0, 180) };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

function isLikelyRefreshCookie(name) {
  return /refresh/i.test(String(name || ''));
}

async function writeKiroTokenCache(refreshToken, metadata = {}) {
  if (!isKiroRefreshToken(refreshToken)) return;
  const cachePath = join(homedir(), '.aws/sso/cache');
  await mkdir(cachePath, { recursive: true });
  await chmod(join(homedir(), '.aws'), 0o700).catch(() => {});
  await chmod(join(homedir(), '.aws/sso'), 0o700).catch(() => {});
  await chmod(cachePath, 0o700).catch(() => {});
  const p = join(cachePath, 'kiro-auth-token.json');
  await writeFile(p, JSON.stringify({ refreshToken, source: metadata.source || 'browser-cookie', updatedAt: new Date().toISOString() }, null, 2));
  await chmod(p, 0o600).catch(() => {});
}

export function normalizeKiroModels(data) {
  const raw = Array.isArray(data?.models) ? data.models : Array.isArray(data?.data) ? data.data : [];
  return raw.map((item) => {
    const id = String(item?.modelId || item?.id || item?.name || item || '').trim();
    if (!id) return null;
    return {
      id,
      name: item?.modelName || item?.displayName || item?.name || humanizeModelId(id),
      context: item?.tokenLimits?.maxInputTokens || item?.maxInputTokens || item?.context || null,
      description: item?.description || null,
    };
  }).filter(Boolean).filter((model, index, arr) => arr.findIndex((candidate) => candidate.id === model.id) === index);
}

function decodeJwtPayload(token) {
  const parts = String(token || '').split('.');
  if (parts.length < 2) return null;
  try { return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch { return null; }
}

function humanizeModelId(id) {
  return String(id).split('/').pop().replace(/[-_]/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function safeJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function sanitizeKiroError(data) {
  if (!data) return '';
  if (typeof data === 'string') return data.slice(0, 240);
  const message = data.message || data.errorMessage || data.error_description || data.error || data.raw;
  return message ? String(message).replace(/aorAAAAAG[\w.-]+/g, '[redacted]').slice(0, 240) : '';
}
