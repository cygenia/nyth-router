// Loads the static provider registry into SQLite the first time the server
// starts (and refreshes any baseline metadata that didn't exist before). User
// edits to providers/models are kept; this only inserts missing rows.

import db from '../db/connection.js';
import { getRegistry } from '../registry/providers.js';

export function syncRegistry() {
  const registry = getRegistry();
  const insertProvider = db.prepare(`
    INSERT INTO providers (id, name, category, format, base_url, auth_type, capabilities, docs_url, status, enabled, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      category = excluded.category,
      format = excluded.format,
      base_url = excluded.base_url,
      auth_type = excluded.auth_type,
      capabilities = excluded.capabilities,
      docs_url = excluded.docs_url,
      status = excluded.status,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `);
  const insertModel = db.prepare(`
    INSERT INTO models (provider_id, id, display_name, context_length, input_price, output_price, capabilities, release_status, tags, metadata_only, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider_id, id) DO UPDATE SET
      display_name = excluded.display_name,
      context_length = excluded.context_length,
      input_price = excluded.input_price,
      output_price = excluded.output_price,
      capabilities = excluded.capabilities,
      release_status = excluded.release_status,
      tags = excluded.tags,
      metadata_only = excluded.metadata_only,
      updated_at = excluded.updated_at
  `);
  const deleteMissingModel = db.prepare('DELETE FROM models WHERE provider_id = ? AND id = ?');
  const now = Date.now();
  const tx = db.transaction(() => {
    for (const p of registry) {
      insertProvider.run(
        p.id,
        p.name,
        p.category,
        p.format,
        p.baseUrl,
        p.authType || 'bearer',
        JSON.stringify(p.capabilities || []),
        p.docsUrl || '',
        p.status || 'metadata-only',
        1,
        p.notes || null,
        now,
        now,
      );
      const registryModelIds = new Set((p.models || []).map((model) => model.id));
      for (const row of db.prepare('SELECT id FROM models WHERE provider_id = ?').all(p.id)) {
        if (!registryModelIds.has(row.id)) deleteMissingModel.run(p.id, row.id);
      }
      for (const m of p.models || []) {
        insertModel.run(
          p.id,
          m.id,
          m.display || m.id,
          m.context ?? null,
          m.in ?? null,
          m.out ?? null,
          JSON.stringify(m.capabilities || []),
          m.status || null,
          JSON.stringify(m.tags || []),
          p.status === 'implemented' ? 0 : 1,
          now,
          now,
        );
      }
    }
  });
  tx();
}
