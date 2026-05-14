import db from '../db/connection.js';
import { prefixedId } from '../lib/id.js';
import { hasUnknownPricing } from './costCalculator.js';
import { config } from '../config.js';
import { preview as previewText } from './tokenizer.js';
import crypto from 'node:crypto';

const insertLog = db.prepare(`
  INSERT INTO request_logs (
    id, ts, app_id, app_name, unified_key_id, oauth_account_id, route_id, route_alias, provider_id, model, requested_model,
    input_tokens, output_tokens, total_tokens, estimated_cost, latency_ms, status, error_reason,
    fallback_chain, prompt_preview, response_preview, endpoint, streaming, request_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertFallback = db.prepare(`
  INSERT INTO fallback_events (id, request_id, ts, from_provider, to_provider, reason, step_index)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const upsertUsageDaily = db.prepare(`
  INSERT INTO usage_daily (day, provider_id, model, app_id, request_count, input_tokens, output_tokens, estimated_cost, error_count)
  VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)
  ON CONFLICT(day, provider_id, model, app_id) DO UPDATE SET
    request_count = request_count + 1,
    input_tokens = input_tokens + excluded.input_tokens,
    output_tokens = output_tokens + excluded.output_tokens,
    estimated_cost = estimated_cost + excluded.estimated_cost,
    error_count = error_count + excluded.error_count
`);

const upsertFingerprint = db.prepare(`
  INSERT INTO prompt_fingerprints (id, fingerprint, preview, hits, total_tokens, estimated_cost, first_seen_at, last_seen_at)
  VALUES (?, ?, ?, 1, ?, ?, ?, ?)
  ON CONFLICT(fingerprint) DO UPDATE SET
    hits = hits + 1,
    total_tokens = total_tokens + excluded.total_tokens,
    estimated_cost = estimated_cost + excluded.estimated_cost,
    last_seen_at = excluded.last_seen_at
`);

export function logRequest(entry) {
  const id = entry.id || prefixedId('req');
  const ts = entry.ts || Date.now();
  const day = new Date(ts).toISOString().slice(0, 10);
  const promptText = config.promptLogMode === 'off' ? null
    : config.promptLogMode === 'metadata' ? null
    : previewText(entry.prompt, config.promptLogMode === 'full' ? 4000 : 240);
  const responseText = config.promptLogMode === 'off' || config.promptLogMode === 'metadata' ? null
    : previewText(entry.response, config.promptLogMode === 'full' ? 4000 : 240);
  insertLog.run(
    id,
    ts,
    entry.appId || null,
    entry.appName || null,
    entry.unifiedKeyId || null,
    entry.oauthAccountId || null,
    entry.routeId || null,
    entry.routeAlias || null,
    entry.providerId || null,
    entry.model || null,
    entry.requestedModel || null,
    entry.inputTokens || 0,
    entry.outputTokens || 0,
    (entry.inputTokens || 0) + (entry.outputTokens || 0),
    entry.estimatedCost || 0,
    entry.latencyMs || 0,
    entry.status || 'ok',
    entry.errorReason || null,
    JSON.stringify(entry.fallbackChain || []),
    promptText,
    responseText,
    entry.endpoint || null,
    entry.streaming ? 1 : 0,
    entry.requestId || id,
  );
  const shouldCountUsage = entry.providerId && entry.model && entry.errorReason !== 'provider_missing';
  if (shouldCountUsage) {
    upsertUsageDaily.run(
      day,
      entry.providerId,
      entry.model,
      entry.appId || '',
      entry.inputTokens || 0,
      entry.outputTokens || 0,
      entry.estimatedCost || 0,
      entry.status === 'ok' ? 0 : 1,
    );
  }
  if (entry.fallbackChain && entry.fallbackChain.length > 1) {
    for (let i = 1; i < entry.fallbackChain.length; i += 1) {
      insertFallback.run(
        prefixedId('fb'),
        id,
        ts,
        entry.fallbackChain[i - 1].providerId,
        entry.fallbackChain[i].providerId,
        entry.fallbackChain[i].reason || 'fallback',
        i,
      );
    }
  }
  if (promptText) {
    const fp = crypto.createHash('sha256').update(promptText).digest('hex').slice(0, 16);
    upsertFingerprint.run(
      prefixedId('fp'),
      fp,
      promptText.slice(0, 120),
      entry.inputTokens || 0,
      entry.estimatedCost || 0,
      ts,
      ts,
    );
  }
  return id;
}

export function listLogs({ limit = 100, offset = 0, providerId, appId, status, since, q } = {}) {
  const where = [];
  const params = [];
  if (providerId) { where.push('provider_id = ?'); params.push(providerId); }
  if (appId) { where.push('app_id = ?'); params.push(appId); }
  if (status) { where.push('status = ?'); params.push(status); }
  if (since) { where.push('ts >= ?'); params.push(Number(since)); }
  if (q) { where.push('(model LIKE ? OR prompt_preview LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT id, ts, app_id AS appId, app_name AS appName, unified_key_id AS unifiedKeyId,
           oauth_account_id AS oauthAccountId, route_id AS routeId, route_alias AS routeAlias, provider_id AS providerId,
           model, requested_model AS requestedModel, input_tokens AS inputTokens,
           output_tokens AS outputTokens, total_tokens AS totalTokens,
           estimated_cost AS estimatedCost, latency_ms AS latencyMs, status,
           error_reason AS errorReason, fallback_chain AS fallbackChain,
           prompt_preview AS promptPreview, response_preview AS responsePreview,
           endpoint, streaming, request_id AS requestId
    FROM request_logs
    ${whereSql}
    ORDER BY ts DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);
  return rows.map((r) => ({
    ...r,
    fallbackChain: safeJson(r.fallbackChain, []),
    costIncomplete: r.providerId && r.model ? hasUnknownPricing({ providerId: r.providerId, model: r.model }) : false,
  }));
}

export function pruneOldLogs() {
  if (!config.logRetentionDays) return;
  const cutoff = Date.now() - config.logRetentionDays * 86400000;
  db.prepare('DELETE FROM request_logs WHERE ts < ?').run(cutoff);
  db.prepare('DELETE FROM fallback_events WHERE ts < ?').run(cutoff);
}

function safeJson(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}
