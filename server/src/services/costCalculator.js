// Simple cost calculator using the provider/model price metadata loaded from
// the registry. If pricing is missing or unknown, returns null which callers
// must treat as "unknown" and surface clearly in the UI.

import db from '../db/connection.js';

export function getModelPricing(providerId, modelId) {
  const row = db.prepare(`
    SELECT input_price, output_price FROM models
    WHERE provider_id = ? AND id = ?
  `).get(providerId, modelId);
  return normalizePricing(row);
}

export function estimateCost({ providerId, model, inputTokens, outputTokens }) {
  const pricing = getModelPricing(providerId, model);
  if (!pricing) return null;
  const inCost = ((inputTokens || 0) / 1000) * (pricing.input || 0);
  const outCost = ((outputTokens || 0) / 1000) * (pricing.output || 0);
  return Number((inCost + outCost).toFixed(6));
}

export function hasUnknownPricing({ providerId, model }) {
  return getModelPricing(providerId, model) == null;
}

export function hasAnyUnknownPricing() {
  const row = db.prepare(`
    SELECT COUNT(*) AS c
    FROM request_logs l
    LEFT JOIN models m ON m.provider_id = l.provider_id AND m.id = l.model
    WHERE l.provider_id IS NOT NULL
      AND l.model IS NOT NULL
      AND (m.provider_id IS NULL OR (m.input_price IS NULL AND m.output_price IS NULL))
  `).get();
  return (row?.c || 0) > 0;
}

export function hasUnknownPricingSince(since) {
  const row = db.prepare(`
    SELECT COUNT(*) AS c
    FROM request_logs l
    LEFT JOIN models m ON m.provider_id = l.provider_id AND m.id = l.model
    WHERE l.ts >= ?
      AND l.provider_id IS NOT NULL
      AND l.model IS NOT NULL
      AND (m.provider_id IS NULL OR (m.input_price IS NULL AND m.output_price IS NULL))
  `).get(since);
  return (row?.c || 0) > 0;
}

export function getPricingCoverage(days = 14) {
  const since = Date.now() - Math.max(1, Number(days || 14)) * 86400000;
  const rows = db.prepare(`
    SELECT l.provider_id AS providerId,
           l.model,
           COUNT(*) AS requests,
           COALESCE(SUM(l.input_tokens), 0) AS inputTokens,
           COALESCE(SUM(l.output_tokens), 0) AS outputTokens,
           m.input_price AS inputPrice,
           m.output_price AS outputPrice
    FROM request_logs l
    LEFT JOIN models m ON m.provider_id = l.provider_id AND m.id = l.model
    WHERE l.ts >= ? AND l.provider_id IS NOT NULL AND l.model IS NOT NULL
    GROUP BY l.provider_id, l.model
    ORDER BY requests DESC
  `).all(since);
  const unknown = rows.filter((row) => normalizePricing({ input_price: row.inputPrice, output_price: row.outputPrice }) == null);
  return {
    days: Math.max(1, Number(days || 14)),
    unknownCount: unknown.length,
    unknown,
  };
}

function normalizePricing(row) {
  if (!row) return null;
  if (row.input_price == null && row.output_price == null) return null;
  return { input: row.input_price, output: row.output_price };
}

export function compareAcrossModels({ inputTokens, outputTokens }) {
  const rows = db.prepare(`
    SELECT m.provider_id AS providerId, m.id AS modelId, m.display_name AS displayName,
           m.input_price AS inputPrice, m.output_price AS outputPrice,
           p.name AS providerName
    FROM models m
    JOIN providers p ON p.id = m.provider_id
    WHERE m.input_price IS NOT NULL AND m.output_price IS NOT NULL
  `).all();
  return rows.map((r) => {
    const cost = ((inputTokens || 0) / 1000) * (r.inputPrice || 0)
      + ((outputTokens || 0) / 1000) * (r.outputPrice || 0);
    return { ...r, estimatedCost: Number(cost.toFixed(6)) };
  }).sort((a, b) => a.estimatedCost - b.estimatedCost);
}
