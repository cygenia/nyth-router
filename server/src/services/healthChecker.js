import db from '../db/connection.js';
import { getAdapter } from '../adapters/index.js';
import { pickKeyForProvider, recordKeyUsage } from './keyVault.js';

const TIMEOUT_MS = 5000;

export async function pingProvider(providerId) {
  const provider = db.prepare(`
    SELECT id, name, format, base_url AS baseUrl, auth_type AS authType
    FROM providers WHERE id = ?
  `).get(providerId);
  if (!provider) return { ok: false, error: 'provider_not_found' };
  const key = pickKeyForProvider(providerId);
  const baseUrl = key?.baseUrlOverride || provider.baseUrl;
  const adapter = getAdapter(provider.format);
  if (typeof adapter.ping !== 'function') {
    return { ok: false, error: 'no_ping_for_format' };
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await adapter.ping({
      baseUrl,
      apiKey: key?.apiKey,
      authType: provider.authType,
      signal: ctrl.signal,
    });
    if (key && !res.ok) recordKeyUsage(key.id, { error: res.error || `status_${res.status}` });
    if (key && res.ok) recordKeyUsage(key.id, {});
    return res;
  } catch (err) {
    if (key) recordKeyUsage(key.id, { error: String(err.message || err) });
    return { ok: false, status: 0, error: String(err.message || err) };
  } finally {
    clearTimeout(timer);
  }
}
