import db from '../db/connection.js';

const DAY = 86400000;

export function getOverview() {
  const now = Date.now();
  const since24h = now - DAY;
  const totalRow = db.prepare(`
    SELECT COUNT(*) AS requests,
           COALESCE(SUM(input_tokens), 0) AS inputTokens,
           COALESCE(SUM(output_tokens), 0) AS outputTokens,
           COALESCE(SUM(total_tokens), 0) AS totalTokens,
           COALESCE(SUM(estimated_cost), 0) AS estimatedCost,
           SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END) AS errors
    FROM request_logs
  `).get();
  const recentRow = db.prepare(`
    SELECT COUNT(*) AS requests,
           COALESCE(SUM(input_tokens), 0) AS inputTokens,
           COALESCE(SUM(output_tokens), 0) AS outputTokens,
           COALESCE(SUM(estimated_cost), 0) AS estimatedCost,
           AVG(latency_ms) AS avgLatency,
           SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END) AS errors
    FROM request_logs WHERE ts >= ?
  `).get(since24h);
  const latencyRow = db.prepare(`
    SELECT latency_ms FROM request_logs WHERE ts >= ? ORDER BY latency_ms ASC
  `).all(since24h).map((r) => r.latency_ms || 0);
  const providerCount = db.prepare('SELECT COUNT(*) AS c FROM providers WHERE enabled = 1').get().c;
  const routeCount = db.prepare('SELECT COUNT(*) AS c FROM routes WHERE enabled = 1').get().c;
  const fallbackEvents24h = db.prepare(`
    SELECT COUNT(*) AS c FROM fallback_events WHERE ts >= ?
  `).get(since24h).c;
  return {
    totals: {
      requests: totalRow.requests,
      inputTokens: totalRow.inputTokens,
      outputTokens: totalRow.outputTokens,
      totalTokens: totalRow.totalTokens,
      estimatedCost: round(totalRow.estimatedCost),
      errors: totalRow.errors,
    },
    last24h: {
      requests: recentRow.requests,
      inputTokens: recentRow.inputTokens,
      outputTokens: recentRow.outputTokens,
      estimatedCost: round(recentRow.estimatedCost),
      errors: recentRow.errors,
      avgLatencyMs: Math.round(recentRow.avgLatency || 0),
      p50LatencyMs: percentile(latencyRow, 50),
      p95LatencyMs: percentile(latencyRow, 95),
      p99LatencyMs: percentile(latencyRow, 99),
    },
    providersActive: providerCount,
    routesActive: routeCount,
    fallbackEvents24h,
  };
}

export function getDailyUsage(days = 14) {
  const since = new Date(Date.now() - days * DAY).toISOString().slice(0, 10);
  return db.prepare(`
    SELECT day,
           SUM(request_count) AS requests,
           SUM(input_tokens) AS inputTokens,
           SUM(output_tokens) AS outputTokens,
           SUM(estimated_cost) AS estimatedCost,
           SUM(error_count) AS errors
    FROM usage_daily
    WHERE day >= ?
    GROUP BY day
    ORDER BY day ASC
  `).all(since);
}

export function getUsageByProvider(days = 14) {
  const since = new Date(Date.now() - days * DAY).toISOString().slice(0, 10);
  return db.prepare(`
    SELECT provider_id AS providerId,
           SUM(request_count) AS requests,
           SUM(input_tokens) AS inputTokens,
           SUM(output_tokens) AS outputTokens,
           SUM(estimated_cost) AS estimatedCost,
           SUM(error_count) AS errors
    FROM usage_daily
    WHERE day >= ?
    GROUP BY provider_id
    ORDER BY estimatedCost DESC
  `).all(since);
}

export function getUsageByModel(days = 14) {
  const since = new Date(Date.now() - days * DAY).toISOString().slice(0, 10);
  return db.prepare(`
    SELECT provider_id AS providerId, model,
           SUM(request_count) AS requests,
           SUM(input_tokens) AS inputTokens,
           SUM(output_tokens) AS outputTokens,
           SUM(estimated_cost) AS estimatedCost,
           SUM(error_count) AS errors
    FROM usage_daily
    WHERE day >= ?
    GROUP BY provider_id, model
    ORDER BY estimatedCost DESC
    LIMIT 50
  `).all(since);
}

export function getUsageByApp(days = 14) {
  const since = new Date(Date.now() - days * DAY).toISOString().slice(0, 10);
  return db.prepare(`
    SELECT app_id AS appId,
           SUM(request_count) AS requests,
           SUM(input_tokens) AS inputTokens,
           SUM(output_tokens) AS outputTokens,
           SUM(estimated_cost) AS estimatedCost,
           SUM(error_count) AS errors
    FROM usage_daily
    WHERE day >= ?
    GROUP BY app_id
    ORDER BY estimatedCost DESC
  `).all(since);
}

export function getRecentFallbacks(limit = 20) {
  return db.prepare(`
    SELECT id, request_id AS requestId, ts, from_provider AS fromProvider, to_provider AS toProvider,
           reason, step_index AS stepIndex
    FROM fallback_events
    ORDER BY ts DESC
    LIMIT ?
  `).all(limit);
}

export function getInsights() {
  // High-level "could be cheaper" / "high error provider" recommendations.
  const insights = [];

  const expensive = db.prepare(`
    SELECT provider_id AS providerId, model, SUM(estimated_cost) AS cost, SUM(request_count) AS count
    FROM usage_daily
    WHERE day >= ?
    GROUP BY provider_id, model
    ORDER BY cost DESC
    LIMIT 5
  `).all(new Date(Date.now() - 14 * DAY).toISOString().slice(0, 10));
  if (expensive.length) {
    insights.push({
      kind: 'cost-leaders',
      severity: 'info',
      title: 'Most expensive models in the last 14 days',
      detail: 'Consider routing simple prompts to cheaper alternatives.',
      data: expensive,
    });
  }

  const errors = db.prepare(`
    SELECT provider_id AS providerId,
           SUM(error_count) AS errors,
           SUM(request_count) AS total,
           CAST(SUM(error_count) AS REAL) / NULLIF(SUM(request_count), 0) AS rate
    FROM usage_daily
    WHERE day >= ?
    GROUP BY provider_id
    HAVING errors > 0 AND rate > 0.1
    ORDER BY rate DESC
    LIMIT 5
  `).all(new Date(Date.now() - 7 * DAY).toISOString().slice(0, 10));
  if (errors.length) {
    insights.push({
      kind: 'high-error-providers',
      severity: 'warn',
      title: 'Providers with elevated error rate (last 7 days)',
      detail: 'Add a fallback chain to keep these workloads stable.',
      data: errors,
    });
  }

  const slow = db.prepare(`
    SELECT provider_id AS providerId, AVG(latency_ms) AS avgLatency, COUNT(*) AS count
    FROM request_logs
    WHERE ts >= ?
    GROUP BY provider_id
    HAVING avgLatency > 4000 AND count >= 5
    ORDER BY avgLatency DESC
  `).all(Date.now() - 7 * DAY);
  if (slow.length) {
    insights.push({
      kind: 'slow-providers',
      severity: 'warn',
      title: 'Providers averaging > 4s in the last 7 days',
      detail: 'Consider promoting a faster provider in the route.',
      data: slow,
    });
  }

  const repeats = db.prepare(`
    SELECT preview, hits, total_tokens AS totalTokens, estimated_cost AS estimatedCost
    FROM prompt_fingerprints
    WHERE hits > 5
    ORDER BY hits DESC
    LIMIT 5
  `).all();
  if (repeats.length) {
    insights.push({
      kind: 'repeated-prompts',
      severity: 'info',
      title: 'Prompts that repeat 5+ times',
      detail: 'These are good candidates for a local cache layer.',
      data: repeats,
    });
  }

  return insights;
}

function percentile(sortedAsc, p) {
  if (!sortedAsc.length) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.floor((p / 100) * sortedAsc.length));
  return Math.round(sortedAsc[idx]);
}

function round(value) {
  return Number((value || 0).toFixed(6));
}
