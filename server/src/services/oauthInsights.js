import crypto from 'node:crypto';
import db from '../db/connection.js';
import { getAdapter } from '../adapters/index.js';
import { decryptSecret } from '../lib/crypto.js';
import { getConnectedAccountCredential } from './oauthPkce.js';

const MODEL_ENDPOINTS = {
  anthropic: { baseUrl: 'https://api.anthropic.com/v1', format: 'anthropic-compatible' },
  gemini: { baseUrl: 'https://cloudcode-pa.googleapis.com/v1internal', format: 'gemini-oauth-account' },
  kiro: { baseUrl: 'https://codewhisperer.us-east-1.amazonaws.com', format: 'kiro-account' },
};

const QUOTA_WINDOWS = {
  codex: [
    { label: '5h observed', cadence: '5h', capacity: null, confidence: 'observed' },
    { label: 'Daily observed', cadence: 'daily', capacity: null, confidence: 'observed' },
  ],
  anthropic: [
    { label: '5h observed', cadence: '5h', capacity: null, confidence: 'observed' },
    { label: 'Weekly observed', cadence: 'weekly', capacity: null, confidence: 'observed' },
  ],
  gemini: [
    { label: 'Daily observed', cadence: 'daily', capacity: null, confidence: 'observed' },
    { label: 'Weekly observed', cadence: 'weekly', capacity: null, confidence: 'observed' },
  ],
  kiro: [
    { label: 'Daily observed', cadence: 'daily', capacity: null, confidence: 'observed' },
    { label: 'Monthly observed', cadence: 'monthly', capacity: null, confidence: 'observed' },
  ],
};

export function inferPlan({ providerId, scope }) {
  const text = `${providerId || ''} ${scope || ''}`.toLowerCase();
  if (text.includes('max')) return 'Max';
  if (text.includes('pro') || text.includes('plus')) return 'Pro';
  if (text.includes('enterprise') || text.includes('team')) return 'Team';
  if (providerId === 'codex') return 'ChatGPT account';
  if (providerId === 'anthropic') return 'Claude account';
  if (providerId === 'gemini') return 'Google account';
  if (providerId === 'kiro') return 'Kiro account';
  return 'Not detected yet';
}

export function inferResetWindow(providerId) {
  if (providerId === 'codex') return { cadence: 'daily', nextResetAt: nextUtcHour(0), confidence: 'estimated' };
  if (providerId === 'anthropic') return { cadence: 'weekly', nextResetAt: nextWeekStartUtc(), confidence: 'estimated' };
  if (providerId === 'gemini') return { cadence: 'daily', nextResetAt: nextUtcHour(0), confidence: 'estimated' };
  if (providerId === 'kiro') return { cadence: 'daily', nextResetAt: nextUtcHour(0), confidence: 'estimated' };
  return { cadence: 'unknown', nextResetAt: null, confidence: 'unknown' };
}

export function listProviderAccountsWithInsights() {
  const accounts = db.prepare(`
    SELECT id, provider_id AS providerId, provider_name AS providerName,
           account_label AS accountLabel, account_subject AS accountSubject, account_email AS accountEmail,
           token_type AS tokenType, scope, expires_at AS expiresAt,
           masked_access_token AS maskedAccessToken, is_default AS isDefault,
           last_health_ok AS lastHealthOk, last_health_status AS lastHealthStatus,
           last_health_error AS lastHealthError, last_health_checked_at AS lastHealthCheckedAt,
           plan_name AS planName, quota_reset_cadence AS quotaResetCadence,
           quota_next_reset_at AS quotaNextResetAt, quota_status AS quotaStatus, oauth_metadata AS oauthMetadata,
           created_at AS connectedAt, updated_at AS updatedAt, last_used_at AS lastUsedAt
    FROM oauth_provider_accounts ORDER BY provider_id ASC, is_default DESC, updated_at DESC
  `).all();
  return accounts.map((row) => {
    const reset = row.quotaResetCadence ? {
      cadence: row.quotaResetCadence,
      nextResetAt: row.quotaNextResetAt ? new Date(row.quotaNextResetAt).toISOString() : null,
      confidence: 'stored',
    } : inferResetWindow(row.providerId);
    return {
      ...row,
      isDefault: !!row.isDefault,
      lastHealthOk: row.lastHealthOk == null ? null : !!row.lastHealthOk,
      planName: row.planName || inferPlan(row),
      quotaStatus: row.quotaStatus || inferQuotaStatus(row),
      quotaResetCadence: reset.cadence,
      quotaNextResetAt: reset.nextResetAt,
      quotaConfidence: reset.confidence,
      statusDetail: buildStatusDetail(row),
      oauthMetadata: safePublicMetadata(row.oauthMetadata),
      quotaWindows: buildQuotaWindows(row),
    };
  });
}

export async function testAllProviderAccounts() {
  const rows = db.prepare(`
    SELECT provider_id AS providerId, provider_name AS providerName, id,
           account_label AS accountLabel, account_email AS accountEmail, is_default AS isDefault
    FROM oauth_provider_accounts
    ORDER BY provider_id ASC, is_default DESC, updated_at DESC
  `).all();
  const results = [];
  for (const row of rows) {
    const checked = await testProviderAccount(row.providerId, row.id);
    results.push({
      providerId: row.providerId,
      providerName: row.providerName,
      accountId: row.id,
      accountLabel: checked.accountEmail || checked.accountLabel || row.accountEmail || row.accountLabel || row.id,
      isDefault: !!row.isDefault,
      ...checked,
    });
  }
  return {
    total: results.length,
    ok: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    limited: results.filter((item) => item.quotaStatus === 'quota_exhausted').length,
    expired: results.filter((item) => item.quotaStatus === 'expired' || item.statusDetail?.status === 'refresh_required').length,
    results,
  };
}

export async function refreshAllProviderAccountInsights() {
  return testAllProviderAccounts();
}

export async function testProviderAccount(providerId, accountId) {
  const row = db.prepare(`
    SELECT id, provider_id AS providerId, encrypted_access_token AS encryptedAccessToken,
           account_label AS accountLabel, account_email AS accountEmail, account_subject AS accountSubject,
           expires_at AS expiresAt, scope, plan_name AS planName, oauth_metadata AS oauthMetadata
    FROM oauth_provider_accounts WHERE provider_id = ? AND id = ?
  `).get(providerId, accountId);
  if (!row) return { ok: false, error: 'oauth_account_not_found' };
  const credential = await getConnectedAccountCredential(providerId, accountId);
  if (!credential?.accessToken) {
    const result = { ok: false, status: 401, error: 'refresh_required', quotaStatus: 'expired' };
    persistHealth(providerId, accountId, result);
    return result;
  }

  let result;
  if (providerId === 'codex') {
    result = await testCodexAccount(row, credential);
  } else {
    result = await testStandardAccount(row, credential);
  }

  const detectedIdentity = detectAccountIdentity(providerId, credential.accessToken, row, result);
  result = {
    ...result,
    accountEmail: result.accountEmail || detectedIdentity.email || row.accountEmail || null,
    accountLabel: result.accountLabel || detectedIdentity.label || row.accountLabel || null,
    accountSubject: result.accountSubject || detectedIdentity.subject || row.accountSubject || null,
    identityHint: result.identityHint || detectedIdentity.hint || null,
  };

  const quotaStatus = classifyQuota(result);
  const statusDetail = buildStatusDetail({ providerId, expiresAt: row.expiresAt, quotaStatus, lastHealthStatus: result.status, lastHealthError: result.error });
  const payload = {
    ok: !!result.ok,
    status: result.status || 0,
    error: sanitizeHealthError(result.error || null),
    quotaStatus,
    statusDetail,
    planName: result.planName || row.planName || inferPlan({ providerId, scope: row.scope }),
    accountEmail: result.accountEmail || row.accountEmail || null,
    accountLabel: result.accountLabel || row.accountLabel || null,
    accountSubject: result.accountSubject || row.accountSubject || null,
    identityHint: result.identityHint || null,
    reset: result.reset || inferResetWindow(providerId),
  };
  persistHealth(providerId, accountId, payload);
  return { ...payload, quotaWindows: buildQuotaWindows({ ...row, providerId, id: accountId, quotaStatus }) };
}

async function testCodexAccount(row, credential) {
  const token = credential?.accessToken || decryptSecret(row.encryptedAccessToken);
  if (!token) return { ok: false, status: 401, error: 'token_decrypt_failed' };
  const account = decodeCodexAccount(token);
  const profile = await fetchCodexUserProfile(token);
  const planName = normalizePlan(account.planName || profile.planName || row.planName);
  const headers = {
    authorization: `Bearer ${token}`,
    accept: 'text/event-stream',
    'content-type': 'application/json',
    'user-agent': 'codex_cli_rs/0.116.0 (Mac OS 26.0.1; arm64) Apple_Terminal/464',
    originator: 'codex_cli_rs',
    session_id: cryptoRandomId(),
    'x-codex-turn-metadata': '',
    'x-client-request-id': cryptoRandomId(),
    connection: 'Keep-Alive',
  };
  if (account.accountId || row.accountSubject) headers['chatgpt-account-id'] = account.accountId || row.accountSubject;
  const body = {
    model: 'gpt-5.5',
    instructions: '',
    input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'ping' }] }],
    stream: true,
    store: false,
    parallel_tool_calls: true,
    reasoning: { effort: 'medium', summary: 'auto' },
    include: ['reasoning.encrypted_content'],
  };
  try {
    const res = await fetch('https://chatgpt.com/backend-api/codex/responses', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
    const text = await res.text();
    if (res.ok) return { ok: true, status: res.status, planName, accountEmail: profile.email || row.accountEmail || null, accountLabel: profile.label || row.accountLabel || null, accountSubject: account.accountId || row.accountSubject || null, reset: inferResetWindow('codex') };
    const parsed = parseErrorPayload(text);
    return {
      ok: false,
      status: res.status,
      error: extractErrorMessage(parsed, text),
      planName,
      accountEmail: profile.email || row.accountEmail || null,
      accountLabel: profile.label || row.accountLabel || null,
      accountSubject: account.accountId || row.accountSubject || null,
      reset: resetFromCodexError(parsed) || inferResetWindow('codex'),
    };
  } catch (err) {
    return { ok: false, status: 0, error: String(err.message || err), planName };
  }
}

async function testStandardAccount(row, credential) {
  const token=credential.accessToken || decryptSecret(row.encryptedAccessToken);
  const endpoint = MODEL_ENDPOINTS[row.providerId] || MODEL_ENDPOINTS.anthropic;
  let result;
  try {
    const adapter = getAdapter(endpoint.format);
    if (typeof adapter.ping === 'function') {
      result = await adapter.ping({ baseUrl: endpoint.baseUrl, apiKey: token, authType: 'bearer', signal: AbortSignal.timeout(8000) });
    } else {
      result = { ok: true, status: 200 };
    }
  } catch (err) {
    result = { ok: false, status: 0, error: String(err.message || err) };
  }
  const identity = detectAccountIdentity(row.providerId, token, row, result);
  return {
    ...result,
    accountEmail: result.accountEmail || identity.email || null,
    accountLabel: result.accountLabel || identity.label || null,
    accountSubject: result.accountSubject || identity.subject || null,
    identityHint: result.identityHint || identity.hint || null,
  };
}

function persistHealth(providerId, accountId, result) {
  const reset = result.reset || inferResetWindow(providerId);
  const current = db.prepare('SELECT oauth_metadata AS oauthMetadata FROM oauth_provider_accounts WHERE provider_id = ? AND id = ?').get(providerId, accountId);
  const metadata = mergeIdentityMetadata(current?.oauthMetadata, result);
  db.prepare(`
    UPDATE oauth_provider_accounts
    SET last_health_ok = ?, last_health_status = ?, last_health_error = ?, last_health_checked_at = ?,
        plan_name = COALESCE(?, plan_name), account_email = COALESCE(?, account_email),
        account_label = COALESCE(?, account_label), account_subject = COALESCE(?, account_subject),
        oauth_metadata = ?, quota_reset_cadence = ?, quota_next_reset_at = ?, quota_status = ?, updated_at = ?
    WHERE provider_id = ? AND id = ?
  `).run(
    result.ok ? 1 : 0,
    result.status || null,
    result.error || null,
    Date.now(),
    result.planName || null,
    result.accountEmail || null,
    result.accountLabel || null,
    result.accountSubject || null,
    JSON.stringify(metadata),
    reset.cadence || null,
    reset.nextResetAt ? Date.parse(reset.nextResetAt) : null,
    result.quotaStatus || 'needs check',
    Date.now(),
    providerId,
    accountId,
  );
}

function classifyQuota(result) {
  const error = String(result?.error || '').toLowerCase();
  if (result?.ok) return 'available';
  if (result?.status === 429 || error.includes('usage_limit_reached') || error.includes('quota') || error.includes('rate')) return 'quota_exhausted';
  if (result?.status === 401 || error.includes('unauthorized') || error.includes('expired')) return 'expired';
  if (result?.status === 403 || error.includes('forbidden')) return 'blocked_or_expired';
  return 'check_failed';
}

function inferQuotaStatus(row) {
  if (row.lastHealthOk === 1) return 'available';
  if (row.lastHealthOk === 0) return row.quotaStatus || 'check_failed';
  if (row.expiresAt && row.expiresAt < Date.now()) return 'expired';
  return 'needs check';
}

function buildStatusDetail(row) {
  const status = row.quotaStatus || inferQuotaStatus(row);
  const error = String(row.lastHealthError || '').toLowerCase();
  const metadata = safeJson(row.oauthMetadata, {});
  if (row.expiresAt && row.expiresAt < Date.now()) {
    return { status: 'expired', label: 'Expired', confidence: 'provider-reported', action: 'Reconnect or refresh required' };
  }
  if (status === 'quota_exhausted' || row.lastHealthStatus === 429 || /usage_limit|quota|rate/.test(error)) {
    return { status: 'provider_limited', label: 'Provider limited', confidence: 'provider-reported', action: 'Wait for provider reset or switch account' };
  }
  if (status === 'blocked_or_expired' || row.lastHealthStatus === 403 || /verify your account|verification|forbidden/.test(error)) {
    return { status: 'account_verification_required', label: 'Verification required', confidence: 'provider-reported', action: 'Open provider account and complete verification' };
  }
  if (status === 'expired' || row.lastHealthStatus === 401 || /unauthorized|expired/.test(error)) {
    return { status: 'refresh_required', label: 'Refresh/reconnect required', confidence: 'provider-reported', action: 'Refresh token or reconnect account' };
  }
  if (status === 'available') {
    const action = metadata.identityHint || null;
    const label = row.accountEmail ? 'Available' : row.accountLabel ? 'Available, email unknown' : 'Available, identity partial';
    return { status: 'available', label, confidence: row.lastHealthStatus ? 'provider-reported' : 'observed', action };
  }
  if (status === 'needs check') {
    return { status: 'needs_check', label: 'Needs check', confidence: 'not-checked', action: 'Run Test OAuth to verify token and detect email/account identity' };
  }
  return { status: 'check_failed', label: 'Check failed', confidence: row.lastHealthStatus ? 'provider-reported' : 'unknown', action: 'Run Test OAuth or reconnect this provider account' };
}


function safePublicMetadata(raw) {
  const parsed = safeJson(raw, {});
  if (!parsed || typeof parsed !== 'object') return {};
  return {
    setupStatus: parsed.setupStatus || null,
    googleProject: parsed.googleProject || null,
    tierId: parsed.tierId || null,
    planName: parsed.planName || null,
    setupError: parsed.setupError || null,
    identityDetection: parsed.identityDetection || null,
    identityHint: parsed.identityHint || null,
    identityClaims: parsed.identityClaims || null,
  };
}

function mergeIdentityMetadata(raw, result) {
  const metadata = safeJson(raw, {});
  if (result.identityHint) metadata.identityHint = result.identityHint;
  if (result.accountEmail) metadata.identityDetection = metadata.identityDetection || 'detected';
  if (!result.accountEmail && result.accountLabel && !metadata.identityHint) {
    metadata.identityHint = 'Provider token is usable, but no email claim was exposed by this OAuth token.';
  }
  return metadata;
}

function detectAccountIdentity(providerId, accessToken, row, result = {}) {
  if (providerId === 'codex') return { email: result.accountEmail || row.accountEmail || null, label: result.accountLabel || row.accountLabel || null, subject: result.accountSubject || row.accountSubject || null };
  const payload = decodeJwtPayload(accessToken) || {};
  const candidates = [
    result.accountEmail,
    payload.email,
    payload.preferred_username,
    payload.upn,
    payload.username,
    payload['cognito:username'],
    payload['custom:email'],
  ].map((value) => String(value || '').trim()).filter(Boolean);
  const email = candidates.find(isEmailLike) || null;
  const label = email || result.accountLabel || row.accountLabel || candidates[0] || null;
  const subject = result.accountSubject || payload.sub || payload.account || row.accountSubject || null;
  let hint = null;
  if (providerId === 'kiro' && !email) {
    hint = 'Kiro token is usable but no email claim was present. To show Gmail, re-import after Kiro IDE login if AWS SSO cache has a newer token, or add/provide a token containing email/preferred_username/upn claim.';
  }
  return { email, label, subject, hint };
}

function isEmailLike(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function safeJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function buildQuotaWindows(row) {
  const windows = QUOTA_WINDOWS[row.providerId] || [{ label: 'Daily', cadence: 'daily', capacity: 100, confidence: 'estimated' }];
  return windows.map((window) => {
    const range = rangeForCadence(window.cadence);
    const usage = observedUsage(row.providerId, row.id || row.accountId || null, range.start, range.end);
    const observedOnly = !window.capacity || window.confidence === 'unknown';
    const percent = Math.min(100, Math.round((usage.requests / window.capacity) * 100));
    return {
      label: window.label,
      cadence: window.cadence,
      used: usage.requests,
      capacity: window.capacity,
      percent: observedOnly ? 0 : percent,
      remaining: observedOnly ? null : Math.max(0, window.capacity - usage.requests),
      resetAt: new Date(range.end).toISOString(),
      confidence: window.confidence === 'observed' ? 'observed' : window.confidence,
      source: row.id ? 'Nyth Router observed request logs for this OAuth account' : 'Nyth Router observed request logs',
      scope: row.id ? 'account' : 'provider',
      tokens: usage.tokens,
      errors: usage.errors,
    };
  });
}

function observedUsage(providerId, accountId, start, end) {
  const accountFilter = accountId ? 'AND oauth_account_id = ?' : '';
  const params = accountId ? [providerId, accountId, start, end] : [providerId, start, end];
  const row = db.prepare(`
    SELECT COUNT(*) AS requests, COALESCE(SUM(total_tokens), 0) AS tokens,
           SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END) AS errors
    FROM request_logs
    WHERE provider_id = ? ${accountFilter} AND ts >= ? AND ts < ?
  `).get(...params);
  return { requests: row?.requests || 0, tokens: row?.tokens || 0, errors: row?.errors || 0 };
}

function rangeForCadence(cadence) {
  const now = Date.now();
  if (cadence === '5h') {
    const size = 5 * 60 * 60 * 1000;
    const start = Math.floor(now / size) * size;
    return { start, end: start + size };
  }
  if (cadence === 'weekly') return { start: weekStartUtc(now), end: nextWeekStartMs(now) };
  if (cadence === 'monthly') return { start: monthStartUtc(now), end: nextMonthStartMs(now) };
  return { start: dayStartUtc(now), end: dayStartUtc(now) + 86400000 };
}

function dayStartUtc(ms) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function weekStartUtc(ms) {
  const d = new Date(dayStartUtc(ms));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1);
  return d.getTime();
}

function nextWeekStartMs(ms) {
  return weekStartUtc(ms) + 7 * 86400000;
}

function monthStartUtc(ms) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

function nextMonthStartMs(ms) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

async function fetchCodexUserProfile(token) {
  const payload = decodeJwtPayload(token) || {};
  const authInfo = payload['https://api.openai.com/auth'] || {};
  const fromToken = {
    email: payload.email || payload['https://api.openai.com/email'] || null,
    label: payload.email || null,
    planName: authInfo.chatgpt_plan_type || null,
  };
  if (fromToken.email || fromToken.planName) return fromToken;
  try {
    const res = await fetch('https://auth.openai.com/oauth/userinfo', {
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    const text = await res.text();
    const data = safeJson(text, {});
    if (!res.ok || !data || typeof data !== 'object') return fromToken;
    const email = data.email || data.preferred_username || null;
    return {
      email,
      label: email || data.name || data.nickname || null,
      planName: data.plan || data.planName || data.chatgpt_plan_type || null,
    };
  } catch {
    return fromToken;
  }
}

function decodeCodexAccount(token) {
  const payload = decodeJwtPayload(token) || {};
  const authInfo = payload['https://api.openai.com/auth'] || {};
  return {
    accountId: authInfo.chatgpt_account_id || null,
    planName: authInfo.chatgpt_plan_type || null,
  };
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

function parseErrorPayload(text) {
  try { return JSON.parse(text || '{}'); } catch { return { raw: text }; }
}

function extractErrorMessage(parsed, text) {
  return parsed?.error?.message || parsed?.message || String(text || '').slice(0, 240) || 'request_failed';
}

function sanitizeHealthError(error) {
  if (!error) return null;
  const text = typeof error === 'string' ? error : JSON.stringify(error);
  if (/insufficient authentication scopes|permission_denied/i.test(text)) {
    return 'OAuth token valid, but the probed API surface rejected the scope. Nyth Router now uses the provider CLI/account endpoint for this OAuth provider.';
  }
  return text.slice(0, 240);
}

function resetFromCodexError(parsed) {
  const error = parsed?.error || {};
  if (error.resets_at) {
    const ms = Number(error.resets_at) > 10_000_000_000 ? Number(error.resets_at) : Number(error.resets_at) * 1000;
    if (Number.isFinite(ms)) return { cadence: 'daily', nextResetAt: new Date(ms).toISOString(), confidence: 'provider' };
  }
  if (error.resets_in_seconds) {
    const ms = Date.now() + Number(error.resets_in_seconds) * 1000;
    if (Number.isFinite(ms)) return { cadence: 'daily', nextResetAt: new Date(ms).toISOString(), confidence: 'provider' };
  }
  return null;
}

function normalizePlan(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'ChatGPT account';
  return raw.replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function cryptoRandomId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nextUtcHour(hour) {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, 0, 0));
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

function nextWeekStartUtc() {
  const now = new Date();
  const day = now.getUTCDay();
  const daysUntilMonday = (8 - day) % 7 || 7;
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilMonday, 0, 0, 0));
  return next.toISOString();
}
