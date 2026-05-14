import { Router } from 'express';
import db from '../db/connection.js';
import { requireDashboard } from '../middleware/auth.js';
import { pingProvider } from '../services/healthChecker.js';
import { listAvailableModels, refreshProviderModels } from '../services/modelAvailability.js';

const router = Router();

router.use(requireDashboard);

router.get('/', (req, res) => {
  const providers = db.prepare(`
    SELECT id, name, category, format, base_url AS baseUrl, auth_type AS authType,
           capabilities, docs_url AS docsUrl, status, enabled, notes,
           created_at AS createdAt, updated_at AS updatedAt
    FROM providers
    ORDER BY name ASC
  `).all().map((row) => ({ ...row, capabilities: safeJson(row.capabilities, []) }));

  const keyCounts = db.prepare(`
    SELECT provider_id AS providerId, COUNT(*) AS count, SUM(enabled) AS enabledCount
    FROM provider_keys GROUP BY provider_id
  `).all();
  const map = new Map(keyCounts.map((r) => [r.providerId, r]));

  const modelCounts = db.prepare(`
    SELECT provider_id AS providerId, COUNT(*) AS count FROM models GROUP BY provider_id
  `).all();
  const modelMap = new Map(modelCounts.map((r) => [r.providerId, r.count]));

  res.json({
    ok: true,
    providers: providers.map((p) => ({
      ...p,
      keyCount: map.get(p.id)?.count || 0,
      keyCountEnabled: map.get(p.id)?.enabledCount || 0,
      modelCount: modelMap.get(p.id) || 0,
    })),
  });
});

router.get('/available-models', (req, res) => {
  res.json({ ok: true, ...listAvailableModels() });
});

router.post('/:id/refresh-models', async (req, res) => {
  const result = await refreshProviderModels(req.params.id, req.body?.accountId || null);
  res.status(result.ok ? 200 : 400).json(result);
});

router.post('/:id/models', (req, res) => {
  const provider = db.prepare('SELECT id FROM providers WHERE id = ?').get(req.params.id);
  if (!provider) return res.status(404).json({ ok: false, error: 'provider_not_found' });
  const modelId = String(req.body?.id || req.body?.model || '').trim();
  if (!modelId) return res.status(400).json({ ok: false, error: 'model_required' });
  const displayName = String(req.body?.displayName || modelId).trim();
  const now = Date.now();
  db.prepare(`
    INSERT INTO models (provider_id, id, display_name, context_length, input_price, output_price, capabilities, release_status, tags, metadata_only, created_at, updated_at)
    VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, 0, ?, ?)
    ON CONFLICT(provider_id, id) DO UPDATE SET
      display_name = excluded.display_name,
      context_length = COALESCE(excluded.context_length, models.context_length),
      capabilities = excluded.capabilities,
      release_status = excluded.release_status,
      tags = excluded.tags,
      metadata_only = 0,
      updated_at = excluded.updated_at
  `).run(
    req.params.id,
    modelId,
    displayName,
    Number(req.body?.contextLength || 128000),
    JSON.stringify(req.body?.capabilities || ['chat', 'tools', 'streaming']),
    String(req.body?.releaseStatus || 'manual'),
    JSON.stringify(req.body?.tags || ['manual']),
    now,
    now,
  );
  res.json({ ok: true, model: { providerId: req.params.id, id: modelId, displayName } });
});

router.delete('/:id/models/:modelId', (req, res) => {
  const provider = db.prepare('SELECT id FROM providers WHERE id = ?').get(req.params.id);
  if (!provider) return res.status(404).json({ ok: false, error: 'provider_not_found' });
  const modelId = String(req.params.modelId || '').trim();
  if (!modelId) return res.status(400).json({ ok: false, error: 'model_required' });
  const existing = db.prepare('SELECT id FROM models WHERE provider_id = ? AND id = ?').get(req.params.id, modelId);
  if (!existing) return res.status(404).json({ ok: false, error: 'model_not_found' });
  db.prepare('DELETE FROM models WHERE provider_id = ? AND id = ?').run(req.params.id, modelId);
  res.json({ ok: true, removed: { providerId: req.params.id, id: modelId } });
});

router.get('/:id', (req, res) => {
  const provider = db.prepare(`
    SELECT id, name, category, format, base_url AS baseUrl, auth_type AS authType,
           capabilities, docs_url AS docsUrl, status, enabled, notes
    FROM providers WHERE id = ?
  `).get(req.params.id);
  if (!provider) return res.status(404).json({ ok: false, error: 'not_found' });
  provider.capabilities = safeJson(provider.capabilities, []);
  const keys = db.prepare(`
    SELECT id, label, masked_key AS maskedKey, base_url_override AS baseUrlOverride,
           default_model AS defaultModel, priority, enabled, last_error AS lastError,
           last_used_at AS lastUsedAt, created_at AS createdAt, updated_at AS updatedAt
    FROM provider_keys
    WHERE provider_id = ?
    ORDER BY priority ASC, created_at DESC
  `).all(req.params.id);
  const models = db.prepare(`
    SELECT id, display_name AS displayName, context_length AS contextLength,
           input_price AS inputPrice, output_price AS outputPrice,
           capabilities, release_status AS releaseStatus, tags, metadata_only AS metadataOnly
    FROM models WHERE provider_id = ?
    ORDER BY display_name ASC
  `).all(req.params.id).map((row) => ({
    ...row,
    capabilities: safeJson(row.capabilities, []),
    tags: safeJson(row.tags, []),
  }));
  res.json({ ok: true, provider: { ...provider, keys, models } });
});

router.patch('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM providers WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ ok: false, error: 'not_found' });
  const updates = [];
  const params = [];
  const allowed = {
    name: 'name', baseUrl: 'base_url', authType: 'auth_type', notes: 'notes', enabled: 'enabled',
  };
  for (const [k, col] of Object.entries(allowed)) {
    if (req.body?.[k] !== undefined) {
      updates.push(`${col} = ?`);
      params.push(k === 'enabled' ? (req.body[k] ? 1 : 0) : String(req.body[k]));
    }
  }
  if (!updates.length) return res.json({ ok: true });
  updates.push('updated_at = ?'); params.push(Date.now());
  params.push(req.params.id);
  db.prepare(`UPDATE providers SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true });
});

router.post('/:id/test', async (req, res) => {
  const result = await pingProvider(req.params.id);
  res.json({ ok: result.ok, status: result.status, error: result.error });
});

function safeJson(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

export default router;
