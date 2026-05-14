import db from '../db/connection.js';
import { getAdapter } from '../adapters/index.js';
import { pickKeyForProvider } from './keyVault.js';
import { getConnectedAccessToken, listConnectedAccounts } from './oauthPkce.js';

const OAUTH_PROVIDER_MAP = {
  codex: 'codex',
  'claude-oauth': 'anthropic',
  'gemini-oauth': 'gemini',
  kiro: 'kiro',
};

export function listAvailableModels() {
  const providerRows = db.prepare(`
    SELECT id, name, category, format, base_url AS baseUrl, auth_type AS authType, status, enabled
    FROM providers
    WHERE enabled = 1
    ORDER BY category ASC, name ASC
  `).all();
  const oauthAccounts = listConnectedAccounts();
  const oauthCount = new Map();
  for (const acct of oauthAccounts) {
    oauthCount.set(acct.providerId, (oauthCount.get(acct.providerId) || 0) + 1);
  }

  const modelsByProvider = db.prepare(`
    SELECT provider_id AS providerId, id, display_name AS displayName, context_length AS contextLength,
           capabilities, release_status AS releaseStatus, tags, metadata_only AS metadataOnly
    FROM models
    ORDER BY display_name ASC
  `).all();
  const grouped = new Map();
  for (const model of modelsByProvider) {
    if (!grouped.has(model.providerId)) grouped.set(model.providerId, []);
    const modelRef = `${model.providerId}/${model.id}`;
    grouped.get(model.providerId).push({
      ...model,
      capabilities: safeJson(model.capabilities, []),
      tags: safeJson(model.tags, []),
      modelRef,
      canonical: modelRef,
      aliases: modelAliases(model.providerId, model.id, model.displayName),
    });
  }

  const providers = providerRows.map((provider) => {
    const oauthProviderId = OAUTH_PROVIDER_MAP[provider.id] || provider.id;
    const connectedAccounts = oauthCount.get(oauthProviderId) || 0;
    const key = provider.authType === 'oauth-connected' ? null : pickKeyForProvider(provider.id);
    const available = provider.authType === 'oauth-connected'
      ? connectedAccounts > 0
      : !!key || provider.format === 'local';
    return {
      ...provider,
      authMode: provider.authType === 'oauth-connected' ? 'oauth' : 'api-key',
      accountProviderId: oauthProviderId,
      accountCount: connectedAccounts,
      keyConfigured: !!key,
      available,
      models: grouped.get(provider.id) || [],
    };
  });
  return {
    providers,
    availableProviders: providers.filter((p) => p.available).length,
    availableModels: providers.reduce((sum, p) => sum + (p.available ? p.models.length : 0), 0),
    connectedOauthAccounts: oauthAccounts.length,
  };
}

export async function refreshProviderModels(providerId, accountId = null) {
  const provider = db.prepare(`
    SELECT id, name, format, base_url AS baseUrl, auth_type AS authType
    FROM providers WHERE id = ?
  `).get(providerId);
  if (!provider) return { ok: false, error: 'provider_not_found' };
  const adapter = getAdapter(provider.format);
  if (!adapter?.listModels) return { ok: false, error: 'adapter_does_not_support_model_list' };
  const oauthProviderId = OAUTH_PROVIDER_MAP[provider.id] || provider.id;
  const key = provider.authType === 'oauth-connected'
    ? await getConnectedAccessToken(oauthProviderId, accountId)
    : pickKeyForProvider(provider.id)?.apiKey;
  if (!key && provider.format !== 'local') return { ok: false, error: provider.authType === 'oauth-connected' ? 'no_oauth_account' : 'no_provider_key' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const result = await adapter.listModels({
      baseUrl: provider.baseUrl,
      apiKey: key,
      authType: provider.authType === 'oauth-connected' ? 'bearer' : provider.authType,
      signal: ctrl.signal,
    });
    if (!result.ok) return result;
    const ids = normalizeModelIds(result.data);
    if (!ids.length) return { ok: false, error: 'no_models_returned', status: result.status };
    upsertDiscoveredModels(provider.id, ids);
    return { ok: true, status: result.status, providerId: provider.id, count: ids.length, models: ids.slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}

function normalizeModelIds(data) {
  const raw = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
  return raw
    .map((item) => typeof item === 'string' ? item : item?.id || item?.name)
    .filter(Boolean)
    .filter((id, index, arr) => arr.indexOf(id) === index)
    .sort();
}

function upsertDiscoveredModels(providerId, ids) {
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO models (provider_id, id, display_name, context_length, input_price, output_price, capabilities, release_status, tags, metadata_only, created_at, updated_at)
    VALUES (?, ?, ?, NULL, NULL, NULL, ?, ?, ?, 0, ?, ?)
    ON CONFLICT(provider_id, id) DO UPDATE SET
      display_name = COALESCE(models.display_name, excluded.display_name),
      release_status = CASE WHEN models.release_status = 'discovered' THEN models.release_status ELSE models.release_status END,
      metadata_only = 0,
      updated_at = excluded.updated_at
  `);
  const tx = db.transaction(() => {
    for (const id of ids) {
      stmt.run(providerId, id, humanizeModelId(id), JSON.stringify(['chat', 'streaming']), 'discovered', JSON.stringify(['discovered']), now, now);
    }
  });
  tx();
}

function humanizeModelId(id) {
  return String(id).split('/').pop().replace(/[-_]/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function modelAliases(providerId, modelId, displayName) {
  const aliases = new Set([`${providerId}/${modelId}`]);
  for (const alias of oauthProviderAliases(providerId, modelId, displayName)) aliases.add(alias);
  return [...aliases];
}

function oauthProviderAliases(providerId, modelId, displayName) {
  const name = displayName || modelId;
  const map = {
    codex: [`openai-codex/${modelId}`, `OpenAI Codex, ${name}`, `OpenAI Codex OAuth, ${name}`],
    'claude-oauth': [`anthropic-oauth/${modelId}`, `claude-code/${modelId}`, `Claude Code, ${name}`, `Claude Code OAuth, ${name}`],
    'gemini-oauth': [`google-oauth/${modelId}`, `gemini-cli/${modelId}`, `Gemini CLI, ${name}`, `Gemini CLI OAuth, ${name}`],
  };
  return map[providerId] || [];
}

function safeJson(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}
