// Gateway service: takes an OpenAI-shaped request, resolves it through the
// route engine, walks the fallback chain, forwards to the chosen adapter,
// logs the request, and returns an OpenAI-compatible response.

import db from '../db/connection.js';
import { getAdapter } from '../adapters/index.js';
import { pickKeyForProvider, recordKeyUsage } from './keyVault.js';
import { resolveModel } from './routeEngine.js';
import { logRequest } from './requestLogger.js';
import { estimateMessages, estimateTokens, preview } from './tokenizer.js';
import { estimateCost } from './costCalculator.js';
import { prefixedId } from '../lib/id.js';
import { optimizeMessages } from './tokenSaver.js';
import { getSettings } from '../routes/settings.js';

const REQUEST_TIMEOUT_MS = 120_000;

export async function dispatchChat({ body, app, unifiedKey }) {
  const requestId = prefixedId('req');
  const ts = Date.now();
  const requestedModel = body?.model || '';
  const settings = getSettings();
  const tokenSaver = optimizeMessages(body?.messages || [], settings);
  const effectiveBody = tokenSaver.savings ? { ...body, messages: tokenSaver.messages } : body;
  const resolved = resolveModel(requestedModel);
  if (resolved.kind === 'unresolved' || !resolved.route) {
    const errorBody = {
      error: {
        message: `Bigliner could not resolve model "${requestedModel}". Configure a route, alias, or use the providerId:modelId form.`,
        type: 'bigliner_resolution_error',
      },
    };
    logRequest({
      id: requestId,
      ts,
      appId: app?.appId || null,
      appName: app?.appName || null,
      unifiedKeyId: unifiedKey?.id || null,
      requestedModel,
      status: 'error',
      errorReason: 'unresolved_model',
      latencyMs: 0,
      endpoint: '/v1/chat/completions',
      prompt: body?.messages || body?.prompt,
    });
    return { status: 400, response: errorBody, decision: { route: null, attempts: [] } };
  }

  const route = resolved.route;
  const steps = route.steps || [];
  const fallbackChain = [];
  const attempts = [];
  let lastError = null;
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    const providerRow = db.prepare(`
      SELECT id, name, format, base_url AS baseUrl, auth_type AS authType
      FROM providers WHERE id = ?
    `).get(step.providerId);
    if (!providerRow) {
      lastError = { reason: 'provider_missing', providerId: step.providerId };
      fallbackChain.push({ providerId: step.providerId, reason: 'provider_missing' });
      attempts.push({ providerId: step.providerId, error: 'provider_missing', model: step.modelId });
      continue;
    }
    const keyEntry = pickKeyForProvider(step.providerId);
    if (!keyEntry && providerRow.format !== 'openai-compatible' && providerRow.format !== 'local') {
      // Public cloud providers generally need a saved provider key. Local and
      // OpenAI-compatible custom runtimes may intentionally run without one.
      lastError = { reason: 'no_key', providerId: step.providerId };
      fallbackChain.push({ providerId: step.providerId, reason: 'no_key' });
      attempts.push({ providerId: step.providerId, error: 'no_key', model: step.modelId });
      continue;
    }
    const baseUrl = keyEntry?.baseUrlOverride || providerRow.baseUrl;
    const adapter = getAdapter(providerRow.format);
    const adapterBody = { ...effectiveBody, model: step.modelId || body.model };
    delete adapterBody.bigliner;
    const stepStart = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    let result;
    try {
      result = await adapter.forwardChat({
        baseUrl,
        apiKey: keyEntry?.apiKey,
        authType: providerRow.authType,
        body: adapterBody,
        signal: ctrl.signal,
      });
    } catch (err) {
      result = { ok: false, status: 0, error: String(err.message || err), data: null };
    } finally {
      clearTimeout(timer);
    }
    const latency = Date.now() - stepStart;
    fallbackChain.push({ providerId: step.providerId, model: step.modelId, latencyMs: latency, status: result.status });
    attempts.push({ providerId: step.providerId, model: step.modelId, status: result.status, latencyMs: latency });

    if (keyEntry) {
      recordKeyUsage(keyEntry.id, { error: result.ok ? null : `status_${result.status}` });
    }

    if (result.ok && result.data && !result.data.error) {
      const inputTokens = result.data?.usage?.prompt_tokens ?? estimateMessages(body.messages || []);
      const outputTokens = result.data?.usage?.completion_tokens ?? estimateTokens(extractAssistantContent(result.data));
      const cost = estimateCost({ providerId: step.providerId, model: step.modelId, inputTokens, outputTokens }) ?? 0;
      const responseBody = {
        ...result.data,
        bigliner: {
          requestId,
          route: { id: route.id, alias: route.alias, kind: resolved.kind },
          provider: step.providerId,
          model: step.modelId,
          latencyMs: latency,
          fallbackChain,
          estimatedCost: cost,
          tokenSaver: tokenSaver.savings,
          local: true,
        },
      };
      logRequest({
        id: requestId,
        ts,
        appId: app?.appId || null,
        appName: app?.appName || null,
        unifiedKeyId: unifiedKey?.id || null,
        routeId: route.id !== 'inline' ? route.id : null,
        routeAlias: route.alias,
        providerId: step.providerId,
        model: step.modelId,
        requestedModel,
        inputTokens,
        outputTokens,
        estimatedCost: cost,
        latencyMs: latency,
        status: 'ok',
        fallbackChain,
        endpoint: '/v1/chat/completions',
        streaming: !!body.stream,
        prompt: body?.messages || body?.prompt,
        response: extractAssistantContent(result.data),
      });
      return { status: 200, response: responseBody, decision: { route, attempts } };
    }

    lastError = {
      reason: classifyError(result),
      providerId: step.providerId,
      model: step.modelId,
      status: result.status,
      message: extractError(result),
    };
    fallbackChain[fallbackChain.length - 1].reason = lastError.reason;
    if (!shouldFallback(step.fallbackOn, lastError.reason)) break;
  }
  const errorBody = {
    error: {
      message: lastError?.message || 'All providers failed.',
      type: 'bigliner_route_exhausted',
      details: lastError,
    },
  };
  logRequest({
    id: requestId,
    ts,
    appId: app?.appId || null,
    appName: app?.appName || null,
    unifiedKeyId: unifiedKey?.id || null,
    routeId: route?.id !== 'inline' ? route?.id : null,
    routeAlias: route?.alias,
    providerId: lastError?.providerId,
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
  return { status: 502, response: errorBody, decision: { route, attempts } };
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
