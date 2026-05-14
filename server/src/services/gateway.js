// Gateway service: takes an OpenAI-shaped request, resolves it through the
// route engine, walks the fallback chain, forwards to the chosen adapter,
// logs the request, and returns an OpenAI-compatible response.

import db from '../db/connection.js';
import { getAdapter } from '../adapters/index.js';
import { listKeysForProvider, pickKeyForProvider, recordKeyUsage } from './keyVault.js';
import { getConnectedAccountCredential, getConnectedAccountCredentialExcluding } from './oauthPkce.js';
import { resolveModel } from './routeEngine.js';
import { logRequest } from './requestLogger.js';
import { estimateMessages, estimateTokens, preview } from './tokenizer.js';
import { estimateCost, hasUnknownPricing } from './costCalculator.js';
import { prefixedId } from '../lib/id.js';
import { optimizeMessages } from './tokenSaver.js';
import { getSettings } from '../routes/settings.js';

const REQUEST_TIMEOUT_MS = 120_000;
const MAX_OAUTH_ACCOUNT_ATTEMPTS = 5;

export async function dispatchChat({ body, app, unifiedKey }) {
  const requestId = prefixedId('req');
  const ts = Date.now();
  const requestedModel = body?.model || '';
  const requestedAccountId = body?.nyth?.oauthAccountId || body?.nyth?.providerAccountId || null;
  const settings = getSettings();
  const tokenSaver = optimizeMessages(body?.messages || [], settings);
  const effectiveBody = tokenSaver.savings ? { ...body, messages: tokenSaver.messages } : body;
  const resolved = resolveModel(requestedModel);
  if (resolved.kind === 'unresolved' || !resolved.route) {
    const errorBody = {
      error: {
        message: `Nyth Router could not resolve model "${requestedModel}". Configure a route, alias, or use the canonical providerId/modelId form.`,
        type: 'nyth_resolution_error',
      },
    };
    logGatewayError({ requestId, ts, app, unifiedKey, route: null, requestedModel, body, lastError: { reason: 'unresolved_model' }, fallbackChain: [] });
    return { status: 400, response: errorBody, decision: { route: null, attempts: [] } };
  }

  const route = resolved.route;
  const steps = route.steps || [];
  const fallbackChain = [];
  const attempts = [];
  const eligibility = await filterEligibleSteps(steps, { requestedAccountId });
  for (const skipped of eligibility.skipped) {
    fallbackChain.push(skipped);
    attempts.push({ providerId: skipped.providerId, model: skipped.model, error: skipped.reason, configError: true });
  }
  if (!eligibility.steps.length) {
    const configError = eligibility.skipped[eligibility.skipped.length - 1] || { reason: 'no_eligible_route_steps' };
    const errorBody = buildErrorResponse({ lastError: configError, attempts, fallbackChain, route, type: 'nyth_route_config_error' });
    logGatewayError({ requestId, ts, app, unifiedKey, route, requestedModel, body, lastError: configError, fallbackChain });
    return { status: 424, response: errorBody, decision: { route, attempts } };
  }

  let lastError = null;
  for (let i = 0; i < eligibility.steps.length; i += 1) {
    const step = eligibility.steps[i];
    const providerRow = db.prepare(`
      SELECT id, name, format, base_url AS baseUrl, auth_type AS authType
      FROM providers WHERE id = ?
    `).get(step.providerId);

    if (providerRow.authType === 'oauth-connected') {
      const oauthResult = await attemptOAuthStep({ providerRow, step, route, resolved, effectiveBody, body, requestId, requestedModel, requestedAccountId, ts, app, unifiedKey, fallbackChain, attempts, tokenSaver, settings });
      if (oauthResult.done) return oauthResult.result;
      lastError = oauthResult.lastError;
      if (!shouldFallback(step.fallbackOn, lastError?.reason || 'error')) break;
      continue;
    }

    const keyEntry = pickKeyForProvider(step.providerId);
    const baseUrl = keyEntry?.baseUrlOverride || providerRow.baseUrl;
    const adapter = getAdapter(providerRow.format);
    const adapterBody = sanitizeAdapterBody({ ...effectiveBody, model: step.modelId || body.model });
    const stepStart = Date.now();
    const result = await forwardWithTimeout(adapter, { baseUrl, apiKey: keyEntry?.apiKey, authType: providerRow.authType, body: adapterBody, settings });
    const latency = Date.now() - stepStart;
    fallbackChain.push({ providerId: step.providerId, model: step.modelId, latencyMs: latency, status: result.status });
    attempts.push({ providerId: step.providerId, model: step.modelId, status: result.status, latencyMs: latency });

    if (keyEntry) recordKeyUsage(keyEntry.id, { error: result.ok ? null : `status_${result.status}` });

    if (result.ok && ((result.data && !result.data.error) || result.stream)) {
      return successResponse({ result, route, resolved, step, oauthCredential: null, body, requestId, ts, app, unifiedKey, requestedModel, fallbackChain, attempts, tokenSaver, latency, settings });
    }

    lastError = {
      reason: classifyError(result),
      providerId: step.providerId,
      oauthAccountId: null,
      model: step.modelId,
      status: result.status,
      message: extractError(result),
    };
    fallbackChain[fallbackChain.length - 1].reason = lastError.reason;
    if (!shouldFallback(step.fallbackOn, lastError.reason)) break;
  }
  const errorBody = buildErrorResponse({ lastError, attempts, fallbackChain, route, type: 'nyth_route_exhausted' });
  logGatewayError({ requestId, ts, app, unifiedKey, route, requestedModel, body, lastError, fallbackChain });
  return { status: 502, response: errorBody, decision: { route, attempts } };
}

async function attemptOAuthStep({ providerRow, step, route, resolved, effectiveBody, body, requestId, requestedModel, requestedAccountId, ts, app, unifiedKey, fallbackChain, attempts, tokenSaver, settings }) {
  const oauthProviderId = oauthAccountProviderId(step.providerId);
  const excludedAccountIds = [];
  let lastError = null;
  for (let attempt = 0; attempt < MAX_OAUTH_ACCOUNT_ATTEMPTS; attempt += 1) {
    const oauthCredential = attempt === 0
      ? await getConnectedAccountCredential(oauthProviderId, requestedAccountId)
      : await getConnectedAccountCredentialExcluding(oauthProviderId, excludedAccountIds);
    if (!oauthCredential) {
      lastError = { reason: 'no_oauth_account', providerId: step.providerId, accountProviderId: oauthProviderId, model: step.modelId };
      fallbackChain.push(lastError);
      attempts.push({ providerId: step.providerId, accountProviderId: oauthProviderId, model: step.modelId, error: 'no_oauth_account' });
      return { done: false, lastError };
    }

    const adapter = getAdapter(providerRow.format);
    const adapterBody = sanitizeAdapterBody({ ...effectiveBody, model: step.modelId || body.model });
    const stepStart = Date.now();
    const result = await forwardWithTimeout(adapter, {
      baseUrl: providerRow.baseUrl,
      apiKey: oauthCredential.accessToken,
      authType: 'bearer',
      credential: oauthCredential,
      body: adapterBody,
      settings,
    });
    const latency = Date.now() - stepStart;
    fallbackChain.push({ providerId: step.providerId, oauthAccountId: oauthCredential.id, model: step.modelId, latencyMs: latency, status: result.status });
    attempts.push({ providerId: step.providerId, oauthAccountId: oauthCredential.id, model: step.modelId, status: result.status, latencyMs: latency });

    updateOAuthHealthFromRuntime(oauthProviderId, oauthCredential.id, result);

    if (result.ok && ((result.data && !result.data.error) || result.stream)) {
      return { done: true, result: successResponse({ result, route, resolved, step, oauthCredential, body, requestId, ts, app, unifiedKey, requestedModel, fallbackChain, attempts, tokenSaver, latency, settings }) };
    }

    lastError = {
      reason: classifyError(result),
      providerId: step.providerId,
      oauthAccountId: oauthCredential.id,
      model: step.modelId,
      status: result.status,
      message: extractError(result),
    };
    fallbackChain[fallbackChain.length - 1].reason = lastError.reason;

    if (!shouldRotateOAuthAccount(result, lastError)) {
      return { done: false, lastError };
    }

    markOAuthAccountProviderReportedFailure(oauthProviderId, oauthCredential.id, lastError);
    excludedAccountIds.push(oauthCredential.id);
  }
  return { done: false, lastError };
}

async function forwardWithTimeout(adapter, params) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await adapter.forwardChat({ ...params, signal: ctrl.signal });
  } catch (err) {
    return { ok: false, status: 0, error: String(err.message || err), data: null };
  } finally {
    clearTimeout(timer);
  }
}

function successResponse({ result, route, resolved, step, oauthCredential, body, requestId, ts, app, unifiedKey, requestedModel, fallbackChain, attempts, tokenSaver, latency, settings }) {
  const inputTokens = result.data?.usage?.prompt_tokens ?? result.data?.usage?.input_tokens ?? estimateMessages(body.messages || []);
  const outputTokens = result.data?.usage?.completion_tokens ?? result.data?.usage?.output_tokens ?? estimateTokens(extractAssistantContent(result.data));
  const rawCost = estimateCost({ providerId: step.providerId, model: step.modelId, inputTokens, outputTokens });
  const cost = rawCost ?? 0;
  const costIncomplete = rawCost == null || hasUnknownPricing({ providerId: step.providerId, model: step.modelId });
  const responseBody = {
    ...(result.data || {}),
    ...(result.stream ? { stream: result.stream } : {}),
    ...(result.streamKeepaliveSeconds != null ? { streamKeepaliveSeconds: result.streamKeepaliveSeconds } : {}),
    ...(settings.nonStreamKeepaliveSeconds != null ? { nonStreamKeepaliveSeconds: Number(settings.nonStreamKeepaliveSeconds || 0) } : {}),
    nyth: {
      requestId,
      route: { id: route.id, alias: route.alias, kind: resolved.kind },
      provider: step.providerId,
      model: step.modelId,
      latencyMs: latency,
      fallbackChain,
      estimatedCost: cost,
      costIncomplete,
      tokenSaver: tokenSaver.savings,
      local: true,
    },
  };
  logRequest({
    id: requestId, ts,
    appId: app?.appId || null, appName: app?.appName || null, unifiedKeyId: unifiedKey?.id || null,
    routeId: route.id !== 'inline' ? route.id : null, routeAlias: route.alias,
    providerId: step.providerId, oauthAccountId: oauthCredential?.id || null,
    model: step.modelId, requestedModel, inputTokens, outputTokens, estimatedCost: cost,
    latencyMs: latency, status: 'ok', fallbackChain,
    endpoint: '/v1/chat/completions', streaming: !!body.stream,
    prompt: body?.messages || body?.prompt,
    response: extractAssistantContent(result.data),
  });
  return { status: 200, response: responseBody, decision: { route, attempts } };
}

async function filterEligibleSteps(steps, { requestedAccountId } = {}) {
  const eligible = [];
  const skipped = [];
  for (const step of steps) {
    const providerRow = db.prepare(`SELECT id, format, auth_type AS authType, enabled FROM providers WHERE id = ?`).get(step.providerId);
    if (!providerRow) { skipped.push({ providerId: step.providerId, model: step.modelId, reason: 'provider_missing' }); continue; }
    if (providerRow.enabled === 0) { skipped.push({ providerId: step.providerId, model: step.modelId, reason: 'provider_disabled' }); continue; }
    if (step.modelId && !db.prepare('SELECT id FROM models WHERE provider_id = ? AND id = ? LIMIT 1').get(step.providerId, step.modelId)) {
      skipped.push({ providerId: step.providerId, model: step.modelId, reason: 'model_missing' }); continue;
    }
    if (providerRow.authType === 'oauth-connected') {
      const oauthProviderId = oauthAccountProviderId(step.providerId);
      if (!await getConnectedAccountCredential(oauthProviderId, requestedAccountId)) {
        skipped.push({ providerId: step.providerId, accountProviderId: oauthProviderId, model: step.modelId, reason: 'no_oauth_account' }); continue;
      }
    } else if (providerRow.format !== 'openai-compatible' && providerRow.format !== 'local') {
      const keys = listKeysForProvider(step.providerId, { onlyEnabled: true });
      if (!keys.length) { skipped.push({ providerId: step.providerId, model: step.modelId, reason: 'no_key' }); continue; }
    }
    eligible.push(step);
  }
  return { steps: eligible, skipped };
}

function oauthAccountProviderId(providerId) {
  if (providerId === 'claude-oauth') return 'anthropic';
  if (providerId === 'gemini-oauth') return 'gemini';
  if (providerId === 'kiro') return 'kiro';
  return providerId;
}

function sanitizeAdapterBody(body) {
  delete body.nyth;
  return body;
}

function shouldRotateOAuthAccount(result, lastError) {
  const reason = lastError?.reason;
  const message = String(lastError?.message || result?.error || result?.data?.error?.message || '').toLowerCase();
  if (result?.status === 429 || reason === 'rate_limit' || /quota|rate limit|usage_limit|too many requests|limited/.test(message)) return true;
  if (result?.status === 401 || /unauthorized|expired|invalid token|refresh_required/.test(message)) return true;
  if (result?.status === 403 && /verification|verify|forbidden|blocked|account/.test(message)) return true;
  return false;
}

function markOAuthAccountProviderReportedFailure(providerId, accountId, lastError) {
  const status = oauthQuotaStatusFromError(lastError);
  db.prepare(`
    UPDATE oauth_provider_accounts
    SET quota_status = ?, last_health_ok = 0, last_health_status = ?, last_health_error = ?, last_health_checked_at = ?, updated_at = ?
    WHERE provider_id = ? AND id = ?
  `).run(status, lastError.status || null, lastError.message || null, Date.now(), Date.now(), providerId, accountId);
}

function updateOAuthHealthFromRuntime(providerId, accountId, result) {
  if (!result?.ok) return;
  db.prepare(`
    UPDATE oauth_provider_accounts
    SET quota_status = 'available', last_health_ok = 1, last_health_status = ?, last_health_error = NULL, last_health_checked_at = ?, last_used_at = ?, updated_at = ?
    WHERE provider_id = ? AND id = ?
  `).run(result.status || 200, Date.now(), Date.now(), Date.now(), providerId, accountId);
}

function oauthQuotaStatusFromError(lastError) {
  const text = String(lastError?.message || '').toLowerCase();
  if (lastError?.status === 429 || /quota|rate|usage_limit|limited/.test(text)) return 'quota_exhausted';
  if (lastError?.status === 401 || /unauthorized|expired|invalid token|refresh_required/.test(text)) return 'expired';
  if (lastError?.status === 403 || /verification|verify|forbidden|blocked/.test(text)) return 'blocked_or_expired';
  return 'provider_limited';
}

function buildErrorResponse({ lastError, attempts, fallbackChain, route, type }) {
  const message = type === 'nyth_route_config_error'
    ? `Nyth Router has no eligible route steps before execution (${lastError?.reason || 'no_eligible_route_steps'}). Fix provider/auth/model configuration.`
    : (lastError?.message || 'All eligible providers failed.');
  return { error: { message, type, details: lastError, attempts, fallbackChain, route: route ? { id: route.id, alias: route.alias } : null } };
}

function logGatewayError({ requestId, ts, app, unifiedKey, route, requestedModel, body, lastError, fallbackChain }) {
  logRequest({
    id: requestId,
    ts,
    appId: app?.appId || null,
    appName: app?.appName || null,
    unifiedKeyId: unifiedKey?.id || null,
    routeId: route?.id !== 'inline' ? route?.id : null,
    routeAlias: route?.alias,
    providerId: lastError?.providerId,
    oauthAccountId: fallbackChain.find((item) => item.providerId === lastError?.providerId)?.oauthAccountId || null,
    model: lastError?.model,
    requestedModel,
    inputTokens: estimateMessages(body.messages || []),
    outputTokens: 0,
    estimatedCost: 0,
    latencyMs: 0,
    status: 'error',
    errorReason: lastError?.reason || 'unknown',
    fallbackChain,
    endpoint: '/v1/chat/completions',
    streaming: !!body.stream,
    prompt: body?.messages || body?.prompt,
  });
}

function classifyError(result) {
  if (!result) return 'unknown';
  if (result.status === 429) return 'rate_limit';
  if (result.status === 408 || result.status === 504) return 'timeout';
  if (result.status === 0) return 'network';
  if (result.status >= 500) return 'server_error';
  if (result.status >= 400) return 'client_error';
  return 'error';
}

function extractError(result) {
  if (!result) return 'no result';
  if (result.error) return String(result.error).slice(0, 240);
  if (result.data?.error?.message) return result.data.error.message;
  if (result.rawText) return preview(result.rawText, 240);
  return result.statusText || `status_${result.status}`;
}

function shouldFallback(fallbackOn, reason) {
  if (!fallbackOn || !fallbackOn.length) return true;
  if (reason === 'rate_limit') return fallbackOn.includes('rate_limit');
  if (reason === 'timeout' || reason === 'network') return fallbackOn.includes('timeout') || fallbackOn.includes('error');
  return fallbackOn.includes('error');
}

function extractAssistantContent(data) {
  if (!data?.choices) return '';
  return data.choices.map((c) => c?.message?.content || '').join('\n');
}
