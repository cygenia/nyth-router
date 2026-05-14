import db from '../db/connection.js';
import { prefixedId } from '../lib/id.js';

const ALIAS_DEFAULTS = {
  'nyth-fast': { strategy: 'fastest', description: 'Pick the lowest-latency available provider.' },
  'nyth-cheap': { strategy: 'cheapest', description: 'Pick the cheapest available model.' },
  'nyth-smart': { strategy: 'priority', description: 'Frontier model with sensible fallback.' },
  'nyth-vision': { strategy: 'priority', description: 'Multimodal-first route.' },
};

export const STRATEGIES = ['priority', 'cheapest', 'fastest', 'capability'];

export function listRoutes() {
  const routes = db.prepare(`
    SELECT id, alias, name, description, strategy, conditions, enabled, is_default AS isDefault,
           created_at AS createdAt, updated_at AS updatedAt
    FROM routes
    ORDER BY is_default DESC, created_at ASC
  `).all().map((row) => ({ ...row, conditions: safeJson(row.conditions, {}) }));
  const stepRows = db.prepare(`
    SELECT id, route_id AS routeId, step_index AS stepIndex, provider_id AS providerId,
           model_id AS modelId, fallback_on AS fallbackOn
    FROM route_steps
    ORDER BY route_id, step_index ASC
  `).all();
  const grouped = new Map();
  for (const s of stepRows) {
    if (!grouped.has(s.routeId)) grouped.set(s.routeId, []);
    grouped.get(s.routeId).push({ ...s, fallbackOn: safeJson(s.fallbackOn, []) });
  }
  return routes.map((r) => ({ ...r, steps: grouped.get(r.id) || [] }));
}

export function getRoute(id) {
  const row = db.prepare(`
    SELECT id, alias, name, description, strategy, conditions, enabled, is_default AS isDefault,
           created_at AS createdAt, updated_at AS updatedAt
    FROM routes WHERE id = ?
  `).get(id);
  if (!row) return null;
  const steps = db.prepare(`
    SELECT id, route_id AS routeId, step_index AS stepIndex, provider_id AS providerId,
           model_id AS modelId, fallback_on AS fallbackOn
    FROM route_steps WHERE route_id = ? ORDER BY step_index ASC
  `).all(id).map((s) => ({ ...s, fallbackOn: safeJson(s.fallbackOn, []) }));
  return { ...row, conditions: safeJson(row.conditions, {}), steps };
}

export function createRoute({ alias, name, description, strategy, conditions, isDefault, steps }) {
  const id = prefixedId('rt');
  const now = Date.now();
  const tx = db.transaction(() => {
    if (isDefault) {
      db.prepare('UPDATE routes SET is_default = 0 WHERE is_default = 1').run();
    }
    db.prepare(`
      INSERT INTO routes (id, alias, name, description, strategy, conditions, enabled, is_default, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(
      id,
      alias || null,
      name || alias || 'route',
      description || '',
      strategy || 'priority',
      JSON.stringify(conditions || {}),
      isDefault ? 1 : 0,
      now,
      now,
    );
    (steps || []).forEach((step, idx) => {
      db.prepare(`
        INSERT INTO route_steps (id, route_id, step_index, provider_id, model_id, fallback_on, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        prefixedId('rs'),
        id,
        idx,
        step.providerId,
        step.modelId || null,
        JSON.stringify(step.fallbackOn || ['error', 'rate_limit', 'timeout']),
        now,
      );
    });
  });
  tx();
  return getRoute(id);
}

export function updateRoute(id, patch = {}) {
  const existing = db.prepare('SELECT * FROM routes WHERE id = ?').get(id);
  if (!existing) return null;
  const tx = db.transaction(() => {
    if (patch.isDefault) {
      db.prepare('UPDATE routes SET is_default = 0 WHERE is_default = 1').run();
    }
    const updates = [];
    const params = [];
    if (patch.alias !== undefined) { updates.push('alias = ?'); params.push(patch.alias || null); }
    if (patch.name !== undefined) { updates.push('name = ?'); params.push(patch.name); }
    if (patch.description !== undefined) { updates.push('description = ?'); params.push(patch.description); }
    if (patch.strategy !== undefined) { updates.push('strategy = ?'); params.push(patch.strategy); }
    if (patch.conditions !== undefined) { updates.push('conditions = ?'); params.push(JSON.stringify(patch.conditions || {})); }
    if (patch.enabled !== undefined) { updates.push('enabled = ?'); params.push(patch.enabled ? 1 : 0); }
    if (patch.isDefault !== undefined) { updates.push('is_default = ?'); params.push(patch.isDefault ? 1 : 0); }
    if (updates.length) {
      updates.push('updated_at = ?'); params.push(Date.now());
      params.push(id);
      db.prepare(`UPDATE routes SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }
    if (Array.isArray(patch.steps)) {
      db.prepare('DELETE FROM route_steps WHERE route_id = ?').run(id);
      patch.steps.forEach((step, idx) => {
        db.prepare(`
          INSERT INTO route_steps (id, route_id, step_index, provider_id, model_id, fallback_on, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          prefixedId('rs'),
          id,
          idx,
          step.providerId,
          step.modelId || null,
          JSON.stringify(step.fallbackOn || ['error', 'rate_limit', 'timeout']),
          Date.now(),
        );
      });
    }
  });
  tx();
  return getRoute(id);
}

export function deleteRoute(id) {
  db.prepare('DELETE FROM routes WHERE id = ?').run(id);
  return { ok: true };
}

export function findRouteByAlias(alias) {
  const row = db.prepare(`
    SELECT id FROM routes WHERE alias = ? AND enabled = 1
  `).get(alias);
  if (!row) return null;
  return getRoute(row.id);
}

export function findDefaultRoute() {
  const row = db.prepare(`
    SELECT id FROM routes WHERE is_default = 1 AND enabled = 1
  `).get();
  if (!row) return null;
  return getRoute(row.id);
}

// resolveModel takes the request body's `model` string and produces a
// list of route steps to attempt. Supported forms:
//   - "providerId/modelId"        (canonical prefix routing)
//   - "alias-name"                (matches a route alias)
//   - "modelId"                   (uses default route or model lookup)
export function resolveModel(modelString) {
  const normalizedModel = normalizeModelString(modelString);
  if (!normalizedModel) {
    const def = findDefaultRoute();
    if (def) return { kind: 'route', route: def };
    return { kind: 'unresolved', requested: modelString };
  }
  if (normalizedModel.includes('/')) {
    const [providerId, ...rest] = normalizedModel.split('/');
    return {
      kind: 'prefix',
      providerId,
      modelId: rest.join('/'),
      route: {
        id: 'inline',
        alias: normalizedModel,
        name: `Inline prefix: ${normalizedModel}`,
        strategy: 'priority',
        conditions: {},
        steps: [
          { stepIndex: 0, providerId, modelId: rest.join('/'), fallbackOn: ['error', 'rate_limit', 'timeout'] },
        ],
      },
    };
  }
  const aliasRoute = findRouteByAlias(normalizedModel);
  if (aliasRoute) return { kind: 'alias', route: aliasRoute };
  // Treat as bare model id with default provider lookup
  const candidate = db.prepare(`
    SELECT provider_id AS providerId FROM models WHERE id = ?
  `).get(normalizedModel);
  if (candidate) {
    return {
      kind: 'model',
      providerId: candidate.providerId,
      modelId: normalizedModel,
      route: {
        id: 'inline',
        alias: normalizedModel,
        name: `Inline model: ${normalizedModel}`,
        strategy: 'priority',
        conditions: {},
        steps: [
          { stepIndex: 0, providerId: candidate.providerId, modelId: normalizedModel, fallbackOn: ['error', 'rate_limit', 'timeout'] },
        ],
      },
    };
  }
  const def = findDefaultRoute();
  if (def) return { kind: 'default', route: def, requested: modelString };
  return { kind: 'unresolved', requested: modelString };
}

function normalizeModelString(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  // Accept UI/exported labels and legacy external-client forms as aliases,
  // but always resolve to the canonical public model ref: providerId/modelId.
  const commaMatch = raw.match(/^(.+?)\s*,\s*(.+)$/);
  if (commaMatch) {
    const providerId = resolveProviderAlias(commaMatch[1]);
    const modelId = providerId ? resolveProviderModelAlias(providerId, commaMatch[2]) : '';
    if (providerId && modelId) return `${providerId}/${modelId}`;
  }

  const separator = raw.includes(':') ? ':' : raw.includes('/') ? '/' : '';
  if (separator) {
    const [providerPart, ...rest] = raw.split(separator);
    const providerId = resolveProviderAlias(providerPart);
    const modelRaw = rest.join(separator);
    const modelId = providerId ? resolveProviderModelAlias(providerId, modelRaw) : '';
    if (providerId && modelId) return `${providerId}/${modelId}`;
  }

  return resolveBareModelAlias(raw) || raw;
}

function normalizeAliasText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/oauth|api|provider|models?|gateway|via/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-');
}

function resolveProviderAlias(value) {
  const rawKey = String(value || '').trim().toLowerCase().replace(/[_\s]+/g, '-');
  const exactAliases = {
    'codex': 'codex',
    'openai-codex': 'codex',
    'claude-oauth': 'claude-oauth',
    'anthropic-oauth': 'claude-oauth',
    'claude-code': 'claude-oauth',
    'gemini-oauth': 'gemini-oauth',
    'google-oauth': 'gemini-oauth',
    'gemini-cli': 'gemini-oauth',
  };
  if (exactAliases[rawKey]) return exactAliases[rawKey];

  const normalized = normalizeAliasText(value);
  if (!normalized) return '';
  const staticAliases = {
    'codex': 'codex',
    'openai-codex': 'codex',
    'openai-codex-account': 'codex',
    'chatgpt-codex': 'codex',
    'openai-oauth-codex': 'codex',
    'claude': 'anthropic',
    'anthropic-claude': 'anthropic',
    'claude-code': 'claude-oauth',
    'claude-oauth': 'claude-oauth',
    'anthropic-oauth': 'claude-oauth',
    'claude-code-oauth': 'claude-oauth',
    'gemini': 'google',
    'google-gemini': 'google',
    'gemini-cli': 'gemini-oauth',
    'gemini-oauth': 'gemini-oauth',
    'google-oauth': 'gemini-oauth',
    'gemini-cli-oauth': 'gemini-oauth',
  };
  if (staticAliases[normalized]) return staticAliases[normalized];

  const row = db.prepare(`
    SELECT id FROM providers
    WHERE lower(id) = lower(?)
       OR lower(replace(replace(name, ' OAuth', ''), ' API', '')) = lower(?)
       OR lower(name) = lower(?)
    LIMIT 1
  `).get(value, value, value);
  if (row?.id) return row.id;

  const providers = db.prepare('SELECT id, name FROM providers').all();
  return providers.find((p) => normalizeAliasText(p.id) === normalized || normalizeAliasText(p.name) === normalized)?.id || '';
}

function resolveProviderModelAlias(providerId, value) {
  const raw = String(value || '').trim();
  if (!providerId || !raw) return '';
  const exact = db.prepare(`
    SELECT id FROM models
    WHERE provider_id = ? AND (lower(id) = lower(?) OR lower(display_name) = lower(?))
    LIMIT 1
  `).get(providerId, raw, raw);
  if (exact?.id) return exact.id;

  const normalized = normalizeAliasText(raw);
  const models = db.prepare('SELECT id, display_name AS displayName FROM models WHERE provider_id = ?').all(providerId);
  return models.find((m) => normalizeAliasText(m.id) === normalized || normalizeAliasText(m.displayName) === normalized)?.id || raw;
}

function resolveBareModelAlias(value) {
  const raw = String(value || '').trim();
  const exact = db.prepare(`
    SELECT id FROM models WHERE lower(id) = lower(?) LIMIT 1
  `).get(raw);
  if (exact?.id) return exact.id;
  const normalized = normalizeAliasText(raw);
  const row = db.prepare('SELECT id, display_name AS displayName FROM models').all()
    .find((m) => normalizeAliasText(m.id) === normalized || normalizeAliasText(m.displayName) === normalized);
  return row?.id || '';
}

export function ensureDefaultRoutes() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM routes').get().c;
  if (count > 0) return;
  // Seed sample aliases pointing at OpenAI/Anthropic/local lanes. These are
  // safe even without keys configured - calls will simply error until the
  // user wires up keys, and the engine will report the missing key clearly.
  createRoute({
    alias: 'nyth-smart',
    name: 'Nyth Router Smart',
    description: ALIAS_DEFAULTS['nyth-smart'].description,
    strategy: 'priority',
    conditions: { requiresTools: true },
    isDefault: true,
    steps: [
      { providerId: 'openai', modelId: 'gpt-5.5' },
      { providerId: 'anthropic', modelId: 'claude-opus-4.7' },
      { providerId: 'google', modelId: 'gemini-3.0-pro' },
    ],
  });
  createRoute({
    alias: 'nyth-fast',
    name: 'Nyth Router Fast',
    description: ALIAS_DEFAULTS['nyth-fast'].description,
    strategy: 'fastest',
    steps: [
      { providerId: 'groq', modelId: 'llama-4-70b' },
      { providerId: 'cerebras', modelId: 'llama-4-70b' },
      { providerId: 'openai', modelId: 'gpt-5.5-mini' },
    ],
  });
  createRoute({
    alias: 'nyth-cheap',
    name: 'Nyth Router Cheap',
    description: ALIAS_DEFAULTS['nyth-cheap'].description,
    strategy: 'cheapest',
    steps: [
      { providerId: 'deepseek', modelId: 'deepseek-v4' },
      { providerId: 'openai', modelId: 'gpt-5-mini' },
      { providerId: 'mistral', modelId: 'mistral-small-3' },
    ],
  });
  createRoute({
    alias: 'nyth-vision',
    name: 'Nyth Router Vision',
    description: ALIAS_DEFAULTS['nyth-vision'].description,
    strategy: 'priority',
    conditions: { requiresVision: true },
    steps: [
      { providerId: 'google', modelId: 'gemini-3.0-pro' },
      { providerId: 'openai', modelId: 'gpt-5.5' },
      { providerId: 'anthropic', modelId: 'claude-opus-4.7' },
    ],
  });
  createRoute({
    alias: 'nyth-local',
    name: 'Nyth Router Local',
    description: 'Prefer local runtimes when available.',
    strategy: 'priority',
    steps: [
      { providerId: 'ollama', modelId: 'llama4' },
      { providerId: 'lmstudio', modelId: 'auto' },
      { providerId: 'vllm', modelId: 'auto' },
    ],
  });
}

function safeJson(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}
