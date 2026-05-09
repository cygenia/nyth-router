import db from '../db/connection.js';
import { encryptSecret, decryptSecret, maskSecret } from '../lib/crypto.js';
import { prefixedId } from '../lib/id.js';

export function listKeys() {
  return db.prepare(`
    SELECT id, provider_id AS providerId, label, masked_key AS maskedKey,
           base_url_override AS baseUrlOverride, default_model AS defaultModel,
           priority, enabled, last_error AS lastError, last_used_at AS lastUsedAt,
           created_at AS createdAt, updated_at AS updatedAt
    FROM provider_keys
    ORDER BY provider_id, priority ASC, created_at DESC
  `).all();
}

export function listKeysForProvider(providerId, { onlyEnabled = false } = {}) {
  const where = onlyEnabled ? 'WHERE provider_id = ? AND enabled = 1' : 'WHERE provider_id = ?';
  return db.prepare(`
    SELECT id, provider_id AS providerId, label, masked_key AS maskedKey,
           base_url_override AS baseUrlOverride, default_model AS defaultModel,
           priority, enabled, last_error AS lastError, last_used_at AS lastUsedAt,
           created_at AS createdAt, updated_at AS updatedAt
    FROM provider_keys
    ${where}
    ORDER BY priority ASC, created_at DESC
  `).all(providerId);
}

export function addKey({ providerId, label, apiKey, baseUrlOverride, defaultModel, priority = 100, enabled = 1 }) {
  if (!providerId || !apiKey) throw new Error('providerId and apiKey are required');
  const id = prefixedId('pk');
  const now = Date.now();
  db.prepare(`
    INSERT INTO provider_keys (id, provider_id, label, encrypted_key, masked_key, base_url_override, default_model, priority, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    providerId,
    label || 'Untitled key',
    encryptSecret(apiKey),
    maskSecret(apiKey),
    baseUrlOverride || null,
    defaultModel || null,
    priority,
    enabled ? 1 : 0,
    now,
    now,
  );
  return getKey(id);
}

export function updateKey(id, patch = {}) {
  const existing = db.prepare('SELECT * FROM provider_keys WHERE id = ?').get(id);
  if (!existing) return null;
  const updates = [];
  const params = [];
  if (patch.label !== undefined) { updates.push('label = ?'); params.push(patch.label); }
  if (patch.baseUrlOverride !== undefined) { updates.push('base_url_override = ?'); params.push(patch.baseUrlOverride || null); }
  if (patch.defaultModel !== undefined) { updates.push('default_model = ?'); params.push(patch.defaultModel || null); }
  if (patch.priority !== undefined) { updates.push('priority = ?'); params.push(Number(patch.priority) || 100); }
  if (patch.enabled !== undefined) { updates.push('enabled = ?'); params.push(patch.enabled ? 1 : 0); }
  if (patch.apiKey !== undefined && patch.apiKey) {
    updates.push('encrypted_key = ?'); params.push(encryptSecret(patch.apiKey));
    updates.push('masked_key = ?'); params.push(maskSecret(patch.apiKey));
  }
  if (!updates.length) return getKey(id);
  updates.push('updated_at = ?'); params.push(Date.now());
  params.push(id);
  db.prepare(`UPDATE provider_keys SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  return getKey(id);
}

export function deleteKey(id) {
  db.prepare('DELETE FROM provider_keys WHERE id = ?').run(id);
  return { ok: true, id };
}

export function getKey(id) {
  return db.prepare(`
    SELECT id, provider_id AS providerId, label, masked_key AS maskedKey,
           base_url_override AS baseUrlOverride, default_model AS defaultModel,
           priority, enabled, last_error AS lastError, last_used_at AS lastUsedAt,
           created_at AS createdAt, updated_at AS updatedAt
    FROM provider_keys WHERE id = ?
  `).get(id);
}

export function revealKey(id) {
  const row = db.prepare('SELECT encrypted_key FROM provider_keys WHERE id = ?').get(id);
  if (!row) return null;
  return decryptSecret(row.encrypted_key);
}

export function pickKeyForProvider(providerId) {
  const keys = listKeysForProvider(providerId, { onlyEnabled: true });
  if (!keys.length) return null;
  const top = keys[0];
  const decrypted = revealKey(top.id);
  if (!decrypted) return null;
  return { ...top, apiKey: decrypted };
}

export function recordKeyUsage(id, { error } = {}) {
  db.prepare(`
    UPDATE provider_keys SET last_used_at = ?, last_error = ?, updated_at = ?
    WHERE id = ?
  `).run(Date.now(), error || null, Date.now(), id);
}
