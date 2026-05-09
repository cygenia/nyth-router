// Simple cost calculator using the provider/model price metadata loaded from
// the registry. If pricing is missing or unknown, returns null which callers
// must treat as "unknown" and surface clearly in the UI.

import db from '../db/connection.js';

export function getModelPricing(providerId, modelId) {
  const row = db.prepare(`
    SELECT input_price, output_price FROM models
    WHERE provider_id = ? AND id = ?
  `).get(providerId, modelId);
  if (!row) return null;
  if (row.input_price == null && row.output_price == null) return null;
  return { input: row.input_price, output: row.output_price };
}

export function estimateCost({ providerId, model, inputTokens, outputTokens }) {
  const pricing = getModelPricing(providerId, model);
  if (!pricing) return null;
  const inCost = ((inputTokens || 0) / 1000) * (pricing.input || 0);
  const outCost = ((outputTokens || 0) / 1000) * (pricing.output || 0);
  return Number((inCost + outCost).toFixed(6));
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
