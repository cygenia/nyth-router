import crypto from 'node:crypto';
import db from '../db/connection.js';
import { encryptSecret, decryptSecret, maskSecret } from '../lib/crypto.js';
import { autoDetectKiroRefreshToken, decodeKiroIdentity, refreshKiroToken } from './kiroAuth.js';


const pending = new Map();
const connected = new Map();
const refreshLocks = new Map();

const REFRESH_SKEW_MS = 5 * 60 * 1000;

const PROVIDERS = {
  codex: {
    id: 'codex',
    name: 'OpenAI Codex',
    authUrl: 'https://auth.openai.com/oauth/authorize',
    tokenUrl: 'https://auth.openai.com/oauth/token',
    clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
    redirectUri: 'http://localhost:1455/auth/callback',
    scopes: ['openid', 'email', 'profile', 'offline_access'],
    extraParams: { codex_cli_simplified_flow: 'true', id_token_add_organizations: 'true', prompt: 'login' },
    note: 'Codex CLI-style PKCE. Open the one-time URL, login, then paste the final localhost callback URL back into Nyth Router.',
  },
  'codex-microsoft': {
    id: 'codex-microsoft',
    accountProviderId: 'codex',
    name: 'OpenAI Codex - Microsoft / Outlook',
    authUrl: 'https://auth.openai.com/oauth/authorize',
    tokenUrl: 'https://auth.openai.com/oauth/token',
    clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
    redirectUri: 'http://localhost:1455/auth/callback',
    scopes: ['openid', 'email', 'profile', 'offline_access'],
    extraParams: { codex_cli_simplified_flow: 'true', id_token_add_organizations: 'true', prompt: 'login', connection: 'windowslive' },
    note: 'Codex CLI-style PKCE with Microsoft / Outlook login forced through OpenAI Auth. Use this when the normal Codex link does not show Microsoft sign-in.',
  },
  'claude-oauth': {
    id: 'claude-oauth',
    accountProviderId: 'anthropic',
    name: 'Claude Code',
    authUrl: 'https://claude.ai/oauth/authorize',
    tokenUrl: 'https://console.anthropic.com/v1/oauth/token',
    clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
    redirectUri: 'http://localhost:54545/callback',
    scopes: ['user:profile', 'user:inference', 'user:sessions:claude_code', 'user:mcp_servers', 'user:file_upload'],
    extraParams: { code: 'true' },
    note: 'Claude Code PKCE. Open the one-time URL, login, then paste the final localhost callback URL back into Nyth Router.',
  },
  'gemini-oauth': {
    id: 'gemini-oauth',
    accountProviderId: 'gemini',
    name: 'Gemini CLI',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: '681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com',
    clientSecret: process.env.GEMINI_OAUTH_CLIENT_SECRET || '',
    redirectUri: 'http://127.0.0.1:8085/oauth2callback',
    scopes: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'],
    extraParams: { access_type: 'offline', prompt: 'consent' },
    pkce: false,
    note: 'Gemini CLI OAuth. Uses the CLI localhost redirect URI; paste the final localhost callback URL back into Nyth Router.',
  },
  kiro: {
    id: 'kiro',
    accountProviderId: 'kiro',
    name: 'Kiro IDE',
    callbackMode: 'refresh-token-import',
    redirectUri: 'Kiro IDE refresh token',
    scopes: ['codewhisperer:completions', 'codewhisperer:analysis', 'codewhisperer:conversations'],
    note: 'Kiro Connect supports browser/cache auto-detect or secure local refreshToken paste from app.kiro.dev. Tokens are encrypted after import and never returned by the API.',
  },
};

export function listPkceProviders() {
  return Object.values(PROVIDERS).map((provider) => {
    const accountProviderId = provider.accountProviderId || provider.id;
    return {
      id: provider.id,
      accountProviderId,
      name: provider.name,
      callbackUrl: provider.redirectUri,
      mode: provider.callbackMode || 'callback-paste',
      connected: isProviderConnected(accountProviderId),
      accountCount: countConnectedAccounts(accountProviderId),
      note: provider.note,
    };
  });
}

export function createPkceSession(providerId) {
  const provider = PROVIDERS[providerId];
  if (!provider) throw new Error('unknown_oauth_provider');
  if (provider.callbackMode === 'refresh-token-import') {
    throw new Error('provider_uses_refresh_token_import');
  }
  const state = randomUrl(24);
  const verifier = randomUrl(64);
  const challenge = sha256Url(verifier);
  const redirectUri = provider.redirectUri;
  const url = new URL(provider.authUrl);
  url.searchParams.set('client_id', provider.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', provider.scopes.join(' '));
  url.searchParams.set('state', state);
  if (provider.pkce !== false) {
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
  }
  Object.entries(provider.extraParams || {}).forEach(([key, value]) => url.searchParams.set(key, value));
  pending.set(state, { providerId, verifier, challenge, redirectUri, createdAt: Date.now(), status: 'pending' });
  return {
    provider: { id: provider.id, accountProviderId: provider.accountProviderId || provider.id, name: provider.name },
    authUrl: url.toString(),
    state,
    codeChallenge: challenge,
    callbackUrl: redirectUri,
    expiresInSeconds: 600,
  };
}

export async function handleCallback(providerId, query) {
  const provider = PROVIDERS[providerId];
  if (!provider) throw new Error('unknown_oauth_provider');
  const state = String(query.state || '');
  const code = String(query.code || '');
  const error = query.error ? String(query.error) : '';
  const session = pending.get(state);
  if (!session || session.providerId !== providerId) {
    return { ok: false, provider: provider.name, error: 'invalid_or_expired_state' };
  }
  if (Date.now() - session.createdAt > 10 * 60 * 1000) {
    pending.delete(state);
    return { ok: false, provider: provider.name, error: 'expired_state' };
  }
  if (error) {
    session.status = 'error';
    session.error = error;
    return { ok: false, provider: provider.name, error };
  }
  session.code = code;
  session.status = 'code_received';

  const exchange = await exchangeCode(provider, code, session.verifier, session.redirectUri);
  session.exchange = exchange;
  if (exchange.ok) {
    const account = await storeConnectedAccount(provider.accountProviderId || providerId, provider, exchange);
    connected.set(providerId, { ...account, accessToken: exchange.accessToken, refreshToken: exchange.refreshToken });
    pending.delete(state);
    return { ok: true, provider: provider.name, status: 'connected', account: sanitizeAccount(account) };
  }
  return { ok: false, provider: provider.name, status: 'code_received_exchange_failed', error: exchange.error, detail: exchange.detail };
}


export async function submitCallbackUrl(providerId, callbackUrl) {
  const provider = PROVIDERS[providerId];
  if (!provider) throw new Error('unknown_oauth_provider');
  let parsed;
  try {
    parsed = new URL(String(callbackUrl || '').trim());
  } catch {
    return { ok: false, provider: provider.name, error: 'invalid_callback_url' };
  }
  const expected = new URL(provider.redirectUri);
  if (parsed.origin !== expected.origin || parsed.pathname !== expected.pathname) {
    return { ok: false, provider: provider.name, error: 'callback_url_does_not_match_provider_redirect', expected: provider.redirectUri };
  }
  return handleCallback(providerId, Object.fromEntries(parsed.searchParams.entries()));
}

export function getOauthStatus() {
  return {
    connected: listConnectedAccounts(),
    pending: Array.from(pending.entries()).map(([state, item]) => ({ state, providerId: item.providerId, status: item.status, createdAt: item.createdAt, error: item.error })),
  };
}

export async function autoImportKiroAccount() {
  return autoRepairKiroAccount();
}

export async function autoRepairKiroAccount(accountId = null) {
  const detected = await autoDetectKiroRefreshToken();
  if (!detected.found) return { ok: false, ...detected };
  const provider = PROVIDERS.kiro;
  try {
    const tokenData = await refreshKiroToken(detected.refreshToken);
    const identity = decodeKiroIdentity(tokenData.accessToken);
    const exchange = buildKiroExchange(provider, tokenData, detected.refreshToken, identity, 'kiro-cache-repair');
    const existing = accountId
      ? db.prepare('SELECT id FROM oauth_provider_accounts WHERE provider_id = ? AND id = ?').get('kiro', accountId)
      : db.prepare('SELECT id FROM oauth_provider_accounts WHERE provider_id = ? ORDER BY is_default DESC, updated_at DESC LIMIT 1').get('kiro');
    if (existing) {
      const updated = updateKiroConnectedAccount(existing.id, exchange);
      return { ok: true, provider: provider.name, status: 'repaired', source: detected.source, sourceType: detected.sourceType || 'local-cache', account: sanitizeAccount(updated) };
    }
    const account = await storeConnectedAccount('kiro', provider, exchange);
    return { ok: true, provider: provider.name, status: 'connected', source: detected.source, sourceType: detected.sourceType || 'local-cache', account: sanitizeAccount(account) };
  } catch (err) {
    return { ok: false, provider: provider.name, source: detected.source, error: String(err.message || err).slice(0, 240) };
  }
}

export async function importKiroRefreshToken(refreshToken) {
  const provider = PROVIDERS.kiro;
  try {
    const tokenData=await refreshKiroToken(refreshToken);
    const identity = decodeKiroIdentity(tokenData.accessToken);
    const exchange = buildKiroExchange(provider, tokenData, refreshToken, identity, 'kiro-refresh-token-import');
    const account = await storeConnectedAccount('kiro', provider, exchange);
    return { ok: true, provider: provider.name, status: 'connected', sourceType: 'secure-local-paste', account: sanitizeAccount(account) };
  } catch (err) {
    return { ok: false, provider: provider.name, error: String(err.message || err).slice(0, 240) };
  }
}

export function listConnectedAccounts() {
  return db.prepare(`
    SELECT id, provider_id AS providerId, provider_name AS providerName,
           account_label AS accountLabel, account_subject AS accountSubject, account_email AS accountEmail,
           token_type AS tokenType, scope, expires_at AS expiresAt,
           masked_access_token AS maskedAccessToken, is_default AS isDefault,
           created_at AS connectedAt, updated_at AS updatedAt, last_used_at AS lastUsedAt
    FROM oauth_provider_accounts ORDER BY provider_id ASC, is_default DESC, updated_at DESC
  `).all().map((row) => ({ ...row, isDefault: !!row.isDefault }));
}

export async function getConnectedAccessToken(providerId, accountId = null) {
  const credential = await getConnectedAccountCredential(providerId, accountId);
  return credential?.accessToken || null;
}

export async function getConnectedAccountCredential(providerId, accountId = null) {
  const row = accountId
    ? db.prepare(`
        SELECT id, provider_id AS providerId, account_subject AS accountSubject,
               encrypted_access_token AS accessToken, encrypted_refresh_token AS refreshToken,
               expires_at AS expiresAt, oauth_metadata AS oauthMetadata
        FROM oauth_provider_accounts WHERE provider_id = ? AND id = ?
      `).get(providerId, accountId)
    : db.prepare(`
        SELECT id, provider_id AS providerId, account_subject AS accountSubject,
               encrypted_access_token AS accessToken, encrypted_refresh_token AS refreshToken,
               expires_at AS expiresAt, oauth_metadata AS oauthMetadata
        FROM oauth_provider_accounts
        WHERE provider_id = ? AND COALESCE(quota_status, '') NOT IN ('quota_exhausted', 'expired')
        ORDER BY CASE WHEN COALESCE(quota_status, '') = 'blocked_or_expired' THEN 1 ELSE 0 END ASC, is_default DESC, updated_at DESC LIMIT 1
      `).get(providerId);
  if (!row) return null;
  const refreshed = await refreshIfNeeded(row);
  if (!refreshed.ok) return null;
  const token = decryptSecret(row.accessToken);
  if (!token) return null;
  const metadata = safeJson(row.oauthMetadata, {});
  return { id: row.id, providerId: row.providerId, accountSubject: row.accountSubject, accessToken: token, metadata, googleProject: metadata.googleProject || null };
}

/**
 * Get a connected account credential, excluding specific account IDs.
 * Used for intra-provider account fallback when an account hits rate limit.
 */
export async function getConnectedAccountCredentialExcluding(providerId, excludeIds = []) {
  const placeholders = excludeIds.length ? `AND id NOT IN (${excludeIds.map(() => '?').join(',')})` : '';
  const row = db.prepare(`
    SELECT id, provider_id AS providerId, account_subject AS accountSubject,
           encrypted_access_token AS accessToken, encrypted_refresh_token AS refreshToken,
           expires_at AS expiresAt, oauth_metadata AS oauthMetadata
    FROM oauth_provider_accounts
    WHERE provider_id = ? AND COALESCE(quota_status, '') NOT IN ('quota_exhausted', 'expired')
    ${placeholders}
    ORDER BY CASE WHEN COALESCE(quota_status, '') = 'blocked_or_expired' THEN 1 ELSE 0 END ASC, is_default DESC, updated_at DESC LIMIT 1
  `).get(providerId, ...excludeIds);
  if (!row) return null;
  const refreshed = await refreshIfNeeded(row);
  if (!refreshed.ok) return null;
  const token = decryptSecret(row.accessToken);
  if (!token) return null;
  const metadata = safeJson(row.oauthMetadata, {});
  return { id: row.id, providerId: row.providerId, accountSubject: row.accountSubject, accessToken: token, metadata, googleProject: metadata.googleProject || null };
}

async function refreshIfNeeded(row) {
  if (!shouldRefresh(row)) return { ok: true };
  return withRefreshLock(row.providerId, row.id, async () => {
    const latest = loadRefreshableAccount(row.providerId, row.id);
    if (!latest) return { ok: false, error: 'oauth_account_not_found' };
    copyRefreshState(row, latest);
    if (!shouldRefresh(latest)) return { ok: true };
    return refreshAccount(latest, row);
  });
}

async function refreshAccount(latest, targetRow = latest) {
  const provider = providerConfigForAccount(latest.providerId);
  const refreshToken = decryptSecret(latest.refreshToken || '');
  if (latest.providerId === 'kiro') return refreshKiroAccountIfNeeded(latest, refreshToken, targetRow);
  if (!provider || !refreshToken) {
    markRefreshFailure(latest, 'refresh_required');
    return { ok: false, error: 'refresh_required' };
  }
  try {
    const body = new URLSearchParams({ grant_type: 'refresh_token', client_id: provider.clientId, refresh_token: refreshToken });
    if (provider.clientSecret) body.set('client_secret', provider.clientSecret);
    const res = await fetch(provider.tokenUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body, signal: AbortSignal.timeout(12000) });
    const text = await res.text();
    const data = safeJson(text, { raw: text.slice(0, 500) });
    if (!res.ok || !data.access_token) {
      markRefreshFailure(latest, isPermanentRefreshFailure(res.status, data) ? 'expired' : 'refresh_required', sanitizeOAuthError(data));
      return { ok: false, error: 'refresh_failed' };
    }
    const now = Date.now();
    const expiresAt = data.expires_in ? now + Number(data.expires_in) * 1000 : null;
    const encryptedAccessToken = encryptSecret(data.access_token);
    const encryptedRefreshToken = data.refresh_token ? encryptSecret(data.refresh_token) : null;
    db.prepare(`
      UPDATE oauth_provider_accounts
      SET encrypted_access_token = ?, encrypted_refresh_token = COALESCE(?, encrypted_refresh_token),
          masked_access_token = ?, expires_at = ?, quota_status = 'available',
          last_health_ok = NULL, last_health_status = NULL, last_health_error = NULL, updated_at = ?
      WHERE provider_id = ? AND id = ?
    `).run(
      encryptedAccessToken,
      encryptedRefreshToken,
      maskSecret(data.access_token),
      expiresAt,
      now,
      latest.providerId,
      latest.id,
    );
    copyRefreshState(targetRow, { accessToken: encryptedAccessToken, refreshToken: encryptedRefreshToken || latest.refreshToken, expiresAt });
    return { ok: true };
  } catch (err) {
    markRefreshFailure(latest, 'refresh_required', String(err.message || err).slice(0, 240));
    return { ok: false, error: 'refresh_failed' };
  }
}

async function refreshKiroAccountIfNeeded(row, refreshToken, targetRow = row) {
  if (!refreshToken) {
    markRefreshFailure(row, 'refresh_required');
    return { ok: false, error: 'refresh_required' };
  }
  try {
    const data = await refreshKiroToken(refreshToken);
    const now = Date.now();
    const expiresAt = data.expiresIn ? now + Number(data.expiresIn) * 1000 : null;
    const metadata = safeJson(row.oauthMetadata, {});
    const identity = decodeKiroIdentity(data.accessToken);
    const encryptedAccessToken=encryptSecret(data.accessToken);
    const encryptedRefreshToken=data.refreshToken ? encryptSecret(data.refreshToken) : null;
    db.prepare(`
      UPDATE oauth_provider_accounts
      SET encrypted_access_token=?, encrypted_refresh_token=COALESCE(?, encrypted_refresh_token),
          masked_access_token=?, expires_at = ?, quota_status = 'available',
          last_health_ok = NULL, last_health_status = NULL, last_health_error = NULL,
          account_email = COALESCE(?, account_email), account_label = COALESCE(?, account_label),
          account_subject = COALESCE(?, account_subject), oauth_metadata=?, updated_at = ?
      WHERE provider_id = ? AND id = ?
    `).run(
      encryptedAccessToken,
      encryptedRefreshToken,
      maskSecret(data.accessToken),
      expiresAt,
      identity.email || null,
      identity.label || null,
      identity.subject || null,
      JSON.stringify({
        ...metadata,
        profileArn: data.profileArn || metadata.profileArn || null,
        authMethod: metadata.authMethod || 'kiro-refresh-token-import',
        identityClaims: identity.rawClaims || metadata.identityClaims || {},
        identityDetection: identity.email ? 'jwt_email' : 'jwt_no_email_claim',
        identityHint: identity.email ? null : 'Kiro refresh token produced no email claim. Re-import after Kiro login if the IDE/AWS SSO cache contains a newer token, or provide an access token/JWT with email/preferred_username/upn claim.',
      }),
      now,
      row.providerId,
      row.id,
    );
    copyRefreshState(targetRow, { accessToken: encryptedAccessToken, refreshToken: encryptedRefreshToken || row.refreshToken, expiresAt });
    return { ok: true };
  } catch (err) {
    const repair = await tryRepairKiroFromCache(row, targetRow, String(err.message || err).slice(0, 240));
    if (repair.ok) return repair;
    markRefreshFailure(row, 'refresh_required', repair.error || String(err.message || err).slice(0, 240));
    return { ok: false, error: 'refresh_failed' };
  }
}

async function tryRepairKiroFromCache(row, targetRow = row, originalError = null) {
  const detected = await autoDetectKiroRefreshToken();
  if (!detected.found) return { ok: false, error: originalError || detected.error || 'kiro_cache_token_not_found' };
  try {
    const tokenData = await refreshKiroToken(detected.refreshToken);
    const identity = decodeKiroIdentity(tokenData.accessToken);
    const exchange = buildKiroExchange(PROVIDERS.kiro, tokenData, detected.refreshToken, identity, 'kiro-cache-auto-repair');
    const updated = updateKiroConnectedAccount(row.id, exchange, row);
    copyRefreshState(targetRow, { accessToken: updated.encryptedAccessToken, refreshToken: updated.encryptedRefreshToken || row.refreshToken, expiresAt: updated.expiresAt });
    return { ok: true, repaired: true, source: detected.source };
  } catch (err) {
    return { ok: false, error: String(err.message || err).slice(0, 240) };
  }
}

function shouldRefresh(row) {
  return !!row?.expiresAt && row.expiresAt <= Date.now() + REFRESH_SKEW_MS;
}

function refreshLockKey(providerId, accountId) {
  return `${providerId}:${accountId}`;
}

async function withRefreshLock(providerId, accountId, fn) {
  const key = refreshLockKey(providerId, accountId);
  const current = refreshLocks.get(key);
  if (current) return current;
  const promise = (async () => fn())();
  refreshLocks.set(key, promise);
  try {
    return await promise;
  } finally {
    if (refreshLocks.get(key) === promise) refreshLocks.delete(key);
  }
}

function loadRefreshableAccount(providerId, accountId) {
  return db.prepare(`
    SELECT id, provider_id AS providerId, account_subject AS accountSubject,
           encrypted_access_token AS accessToken, encrypted_refresh_token AS refreshToken,
           expires_at AS expiresAt, oauth_metadata AS oauthMetadata
    FROM oauth_provider_accounts WHERE provider_id = ? AND id = ?
  `).get(providerId, accountId);
}

function copyRefreshState(target, source) {
  if (!target || !source) return;
  if (source.accessToken !== undefined) target.accessToken = source.accessToken;
  if (source.refreshToken !== undefined) target.refreshToken = source.refreshToken;
  if (source.expiresAt !== undefined) target.expiresAt = source.expiresAt;
  if (source.oauthMetadata !== undefined) target.oauthMetadata = source.oauthMetadata;
}

function isPermanentRefreshFailure(status, data) {
  const message = sanitizeOAuthError(data).toLowerCase();
  return status === 400 && /invalid_grant|revoked|expired|invalid refresh/.test(message) || status === 401;
}

function markRefreshFailure(row, status, detail = null) {
  db.prepare(`
    UPDATE oauth_provider_accounts
    SET quota_status = ?, last_health_ok = 0, last_health_status = 401,
        last_health_error = ?, last_health_checked_at = ?, updated_at = ?
    WHERE provider_id = ? AND id = ?
  `).run(status, detail || 'OAuth access token expired and could not be refreshed. Reconnect required.', Date.now(), Date.now(), row.providerId, row.id);
}

function providerConfigForAccount(providerId) {
  return Object.values(PROVIDERS).find((provider) => (provider.accountProviderId || provider.id) === providerId) || null;
}

export function setDefaultConnectedAccount(providerId, accountId) {
  const row = db.prepare('SELECT id FROM oauth_provider_accounts WHERE provider_id = ? AND id = ?').get(providerId, accountId);
  if (!row) throw new Error('oauth_account_not_found');
  db.transaction(() => {
    db.prepare('UPDATE oauth_provider_accounts SET is_default = 0, updated_at = ? WHERE provider_id = ?').run(Date.now(), providerId);
    db.prepare('UPDATE oauth_provider_accounts SET is_default = 1, updated_at = ? WHERE provider_id = ? AND id = ?').run(Date.now(), providerId, accountId);
  })();
  return { ok: true };
}

export function deleteConnectedAccount(providerId, accountId) {
  const row = db.prepare('SELECT is_default AS isDefault FROM oauth_provider_accounts WHERE provider_id = ? AND id = ?').get(providerId, accountId);
  if (!row) return { ok: true };
  db.prepare('DELETE FROM oauth_provider_accounts WHERE provider_id = ? AND id = ?').run(providerId, accountId);
  if (row.isDefault) {
    const latest = db.prepare('SELECT id FROM oauth_provider_accounts WHERE provider_id = ? ORDER BY updated_at DESC LIMIT 1').get(providerId);
    if (latest) db.prepare('UPDATE oauth_provider_accounts SET is_default = 1, updated_at = ? WHERE id = ?').run(Date.now(), latest.id);
  }
  return { ok: true };
}

function isProviderConnected(providerId) {
  const accountProviderId = accountProviderFor(providerId);
  if (connected.has(providerId) || connected.has(accountProviderId)) return true;
  const row = db.prepare('SELECT 1 FROM oauth_provider_accounts WHERE provider_id = ? LIMIT 1').get(accountProviderId);
  return !!row;
}

function countConnectedAccounts(providerId) {
  const accountProviderId = accountProviderFor(providerId);
  return db.prepare('SELECT COUNT(*) AS count FROM oauth_provider_accounts WHERE provider_id = ?').get(accountProviderId)?.count || 0;
}

function accountProviderFor(providerId) {
  return PROVIDERS[providerId]?.accountProviderId || providerId;
}

async function storeConnectedAccount(providerId, provider, exchange) {
  const now = Date.now();
  const expiresAtMs = exchange.expiresIn ? now + exchange.expiresIn * 1000 : null;
  const id = `oa_${crypto.randomBytes(12).toString('hex')}`;
  const identity = extractAccountIdentity(exchange);
  const oauthMetadata = { ...(exchange.metadata || {}), ...(await buildOauthMetadata(providerId, exchange.accessToken)) };
  const quota = inferInitialQuota(providerId, exchange, oauthMetadata);
  const hasExisting = db.prepare('SELECT 1 FROM oauth_provider_accounts WHERE provider_id = ? LIMIT 1').get(providerId);
  const account = {
    id,
    providerId,
    providerName: provider.name,
    accountLabel: identity.label,
    accountSubject: identity.accountId || identity.subject,
    accountEmail: identity.email,
    tokenType: exchange.tokenType || 'Bearer',
    scope: exchange.scope || provider.scopes.join(' '),
    expiresAt: expiresAtMs ? new Date(expiresAtMs).toISOString() : null,
    maskedAccessToken: maskSecret(exchange.accessToken || ''),
    isDefault: !hasExisting,
    connectedAt: now,
    updatedAt: now,
    lastUsedAt: null,
  };
  db.prepare(`
    INSERT INTO oauth_provider_accounts (
      id, provider_id, provider_name, account_label, account_subject, account_email,
      token_type, scope, expires_at, encrypted_access_token, encrypted_refresh_token,
      masked_access_token, is_default, plan_name, quota_status, quota_reset_cadence, quota_next_reset_at, oauth_metadata, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    providerId,
    provider.name,
    account.accountLabel,
    account.accountSubject,
    account.accountEmail,
    account.tokenType,
    account.scope,
    expiresAtMs,
    encryptSecret(exchange.accessToken || ''),
    encryptSecret(exchange.refreshToken || ''),
    account.maskedAccessToken,
    account.isDefault ? 1 : 0,
    exchange.planName || quota.planName || null,
    quota.status,
    quota.cadence,
    quota.nextResetAt,
    JSON.stringify(oauthMetadata || {}),
    now,
    now,
  );
  return account;
}


function inferInitialQuota(providerId, exchange, metadata = {}) {
  if (providerId === 'codex') {
    const planName = normalizePlan(exchange.planName);
    const until = parseMaybeTime(exchange.subscriptionActiveUntil);
    return {
      planName,
      status: until && until < Date.now() ? 'expired' : 'available',
      cadence: planName.toLowerCase().includes('team') || planName.toLowerCase().includes('enterprise') ? 'weekly' : 'daily',
      nextResetAt: nextUtcHourMs(0),
    };
  }
  if (providerId === 'anthropic') return { planName: 'Claude account', status: 'available', cadence: 'weekly', nextResetAt: nextWeekStartUtcMs() };
  if (providerId === 'gemini') return { planName: metadata.planName || 'Google account', status: 'available', cadence: 'daily', nextResetAt: nextUtcHourMs(0) };
  if (providerId === 'kiro') return { planName: 'Kiro account', status: 'available', cadence: 'unknown', nextResetAt: null };
  return { planName: null, status: 'available', cadence: 'unknown', nextResetAt: null };
}


async function buildOauthMetadata(providerId, accessToken) {
  if (providerId !== 'gemini' || !accessToken) return {};
  const metadata = { provider: 'gemini' };
  try {
    const setup = await setupGeminiCodeAssist(accessToken);
    if (setup.projectId) metadata.googleProject = setup.projectId;
    if (setup.tierId) metadata.tierId = setup.tierId;
    if (setup.planName) metadata.planName = setup.planName;
    if (setup.allowedTiers) metadata.allowedTiers = setup.allowedTiers;
    metadata.setupStatus = setup.ok ? 'ready' : 'incomplete';
    if (setup.error) metadata.setupError = setup.error;
  } catch (err) {
    metadata.setupStatus = 'failed';
    metadata.setupError = String(err.message || err).slice(0, 240);
  }
  return metadata;
}

async function setupGeminiCodeAssist(accessToken) {
  const metadata = { ideType: 'IDE_UNSPECIFIED', platform: 'PLATFORM_UNSPECIFIED', pluginType: 'GEMINI' };
  const load = await callGeminiCodeAssist(accessToken, 'loadCodeAssist', { metadata });
  if (!load.ok) return { ok: false, error: load.error || `loadCodeAssist_${load.status}` };
  const allowedTiers = Array.isArray(load.data?.allowedTiers) ? load.data.allowedTiers : [];
  const defaultTier = allowedTiers.find((tier) => tier?.isDefault) || allowedTiers[0] || {};
  const tierId = String(defaultTier.id || 'legacy-tier');
  let projectId = extractGeminiProject(load.data?.cloudaicompanionProject);
  if (!projectId) {
    const onboard = await callGeminiCodeAssist(accessToken, 'onboardUser', { tierId, metadata });
    if (!onboard.ok) return { ok: false, tierId, allowedTiers, error: onboard.error || `onboardUser_${onboard.status}` };
    projectId = extractGeminiProject(onboard.data?.response?.cloudaicompanionProject || onboard.data?.cloudaicompanionProject);
  } else {
    const onboard = await callGeminiCodeAssist(accessToken, 'onboardUser', { tierId, metadata, cloudaicompanionProject: projectId });
    if (onboard.ok) projectId = extractGeminiProject(onboard.data?.response?.cloudaicompanionProject) || projectId;
  }
  return {
    ok: !!projectId,
    projectId,
    tierId,
    planName: defaultTier.name || defaultTier.displayName || (tierId ? `Google ${tierId}` : 'Google account'),
    allowedTiers,
  };
}

async function callGeminiCodeAssist(accessToken, action, body) {
  const res = await fetch(`https://cloudcode-pa.googleapis.com/v1internal:${action}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      'user-agent': 'GeminiCLI/0.31.0/unknown (linux; x64)',
      'x-goog-api-client': 'google-genai-sdk/1.41.0 gl-node/v22.19.0',
    },
    body: JSON.stringify(body || {}),
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  const data = safeJson(text, { raw: text });
  if (!res.ok) return { ok: false, status: res.status, error: sanitizeOAuthError(data), data };
  return { ok: true, status: res.status, data };
}

function extractGeminiProject(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') return String(value.id || value.projectId || '').trim();
  return '';
}

function safeJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function normalizePlan(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'ChatGPT account';
  return raw.replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function parseMaybeTime(value) {
  if (!value) return null;
  if (typeof value === 'number') return value > 10_000_000_000 ? value : value * 1000;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function nextUtcHourMs(hour) {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, 0, 0));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime();
}

function nextWeekStartUtcMs() {
  const now = new Date();
  const day = now.getUTCDay();
  const daysUntilMonday = (8 - day) % 7 || 7;
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilMonday, 0, 0, 0);
}

function sanitizeAccount(account) {
  return { ...account, accessToken: undefined, refreshToken: undefined, encryptedAccessToken: undefined, encryptedRefreshToken: undefined };
}

function buildKiroExchange(provider, tokenData, fallbackRefreshToken, identity, authMethod) {
  return {
    ok: true,
    accessToken: tokenData.accessToken,
    refreshToken: tokenData.refreshToken || fallbackRefreshToken,
    tokenType: tokenData.tokenType || 'Bearer',
    expiresIn: tokenData.expiresIn || 3600,
    scope: provider.scopes.join(' '),
    accountEmail: identity.email,
    accountSubject: identity.subject,
    accountLabel: identity.label,
    metadata: {
      profileArn: tokenData.profileArn || null,
      authMethod,
      identityClaims: identity.rawClaims || {},
      identityDetection: identity.email ? 'jwt_email' : 'jwt_no_email_claim',
      identityHint: identity.email ? null : 'Kiro refresh token produced no email claim. Re-import after Kiro.dev login if the AWS SSO cache contains a newer token.',
    },
    planName: 'Kiro account',
  };
}

function updateKiroConnectedAccount(accountId, exchange, previousRow = {}) {
  const now = Date.now();
  const expiresAt = exchange.expiresIn ? now + Number(exchange.expiresIn) * 1000 : null;
  const metadata = { ...safeJson(previousRow.oauthMetadata, {}), ...(exchange.metadata || {}) };
  const encryptedAccessToken = encryptSecret(exchange.accessToken || '');
  const encryptedRefreshToken = exchange.refreshToken ? encryptSecret(exchange.refreshToken) : null;
  db.prepare(`
    UPDATE oauth_provider_accounts
    SET provider_name = ?, account_label = COALESCE(?, account_label), account_subject = COALESCE(?, account_subject),
        account_email = COALESCE(?, account_email), token_type = ?, scope = ?, expires_at = ?,
        encrypted_access_token = ?, encrypted_refresh_token = COALESCE(?, encrypted_refresh_token),
        masked_access_token = ?, plan_name = COALESCE(?, plan_name), quota_status = 'available',
        last_health_ok = NULL, last_health_status = NULL, last_health_error = NULL,
        oauth_metadata = ?, updated_at = ?
    WHERE provider_id = 'kiro' AND id = ?
  `).run(
    PROVIDERS.kiro.name,
    exchange.accountLabel || null,
    exchange.accountSubject || null,
    exchange.accountEmail || null,
    exchange.tokenType || 'Bearer',
    exchange.scope || PROVIDERS.kiro.scopes.join(' '),
    expiresAt,
    encryptedAccessToken,
    encryptedRefreshToken,
    maskSecret(exchange.accessToken || ''),
    exchange.planName || null,
    JSON.stringify(metadata),
    now,
    accountId,
  );
  return {
    id: accountId,
    providerId: 'kiro',
    providerName: PROVIDERS.kiro.name,
    accountLabel: exchange.accountLabel,
    accountSubject: exchange.accountSubject,
    accountEmail: exchange.accountEmail,
    tokenType: exchange.tokenType || 'Bearer',
    scope: exchange.scope,
    expiresAt,
    maskedAccessToken: maskSecret(exchange.accessToken || ''),
    updatedAt: now,
    encryptedAccessToken,
    encryptedRefreshToken,
  };
}

async function exchangeCode(provider, code, verifier, redirectUri) {
  if (!code) return { ok: false, error: 'missing_code' };
  try {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: provider.clientId,
      code,
      redirect_uri: redirectUri,
    });
    if (provider.pkce !== false) body.set('code_verifier', verifier);
    if (provider.clientSecret) body.set('client_secret', provider.clientSecret);
    const res = await fetch(provider.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body,
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 500) }; }
    if (!res.ok) {
      return { ok: false, error: `token_exchange_http_${res.status}`, detail: sanitizeOAuthError(data) };
    }
    const idPayload = decodeJwtPayload(data.id_token || '');
    const authInfo = idPayload?.['https://api.openai.com/auth'] || {};
    return {
      ok: true,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      idToken: data.id_token,
      tokenType: data.token_type,
      expiresIn: data.expires_in,
      scope: data.scope,
      planName: authInfo.chatgpt_plan_type || null,
      subscriptionActiveStart: authInfo.chatgpt_subscription_active_start || null,
      subscriptionActiveUntil: authInfo.chatgpt_subscription_active_until || null,
      chatgptAccountId: authInfo.chatgpt_account_id || null,
    };
  } catch (err) {
    return { ok: false, error: 'token_exchange_failed', detail: String(err.message || err) };
  }
}

function extractAccountIdentity(exchange) {
  const payload = decodeJwtPayload(exchange.idToken || '');
  const authInfo = payload?.['https://api.openai.com/auth'] || {};
  const email = exchange.accountEmail || payload?.email || null;
  const subject = exchange.accountSubject || payload?.sub || null;
  const accountId = exchange.chatgptAccountId || authInfo.chatgpt_account_id || null;
  const label = exchange.accountLabel || email || (accountId ? `account:${String(accountId).slice(0, 8)}` : subject ? `account:${String(subject).slice(0, 8)}` : null);
  return { email, subject, accountId, label };
}

function sanitizeOAuthError(data) {
  if (!data || typeof data !== 'object') return data;
  const copy = Array.isArray(data) ? [...data] : { ...data };
  for (const key of Object.keys(copy)) {
    if (/token|secret|code|verifier/i.test(key)) copy[key] = '[redacted]';
    else if (copy[key] && typeof copy[key] === 'object') copy[key] = sanitizeOAuthError(copy[key]);
  }
  return copy;
}

function decodeJwtPayload(token) {
  const parts = String(token || '').split('.');
  if (parts.length < 2) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function randomUrl(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function sha256Url(value) {
  return crypto.createHash('sha256').update(value).digest('base64url');
}
