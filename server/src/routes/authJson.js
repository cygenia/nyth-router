import { Router } from 'express';
import { requireDashboard } from '../middleware/auth.js';
import * as auth from '../services/auth.js';
import db from '../db/connection.js';

const router = Router();

router.use(requireDashboard);

const SAMPLE = {
  $schema: 'https://bigliner.local/auth-config.schema.json',
  apps: [
    {
      name: 'My CLI app',
      description: 'Local CLI that uses Bigliner.',
      redirectUris: ['http://localhost:5173/callback'],
      scopes: ['chat:read', 'chat:write', 'usage:read'],
    },
  ],
  unifiedKeys: [
    { label: 'Default unified key', rateLimitPerMin: 0, allowedRoutes: [], allowedModels: [] },
  ],
};

router.get('/sample', (req, res) => {
  res.json({ ok: true, sample: SAMPLE });
});

router.get('/export', (req, res) => {
  const includeSecrets = req.query.includeSecrets === '1';
  const apps = auth.listApps().map((a) => ({
    name: a.name,
    description: a.description,
    clientId: a.clientId,
    scopes: a.scopes,
    redirectUris: a.redirectUris,
    status: a.status,
  }));
  const unifiedKeys = auth.listUnifiedKeys().map((k) => ({
    label: k.label,
    keyPrefix: k.keyPrefix,
    rateLimitPerMin: k.rateLimitPerMin,
    allowedRoutes: k.allowedRoutes,
    allowedModels: k.allowedModels,
    enabled: !!k.enabled,
  }));
  res.json({
    ok: true,
    config: { apps, unifiedKeys },
    redacted: true,
    note: includeSecrets
      ? 'Local-only export requested, but raw secret values are intentionally never included.'
      : 'Redacted export — never includes secrets.',
  });
});

router.post('/import', (req, res) => {
  const cfg = req.body?.config;
  if (!cfg || typeof cfg !== 'object') {
    return res.status(400).json({ ok: false, error: 'config_required' });
  }
  const created = { apps: [], unifiedKeys: [] };
  if (Array.isArray(cfg.apps)) {
    for (const a of cfg.apps) {
      if (!a?.name) continue;
      const existing = db.prepare('SELECT id FROM apps WHERE name = ?').get(a.name);
      if (existing) continue;
      const result = auth.createApp({
        name: a.name,
        description: a.description,
        redirectUris: a.redirectUris,
        scopes: a.scopes,
      });
      created.apps.push(result);
    }
  }
  if (Array.isArray(cfg.unifiedKeys)) {
    for (const k of cfg.unifiedKeys) {
      const existing = db.prepare('SELECT id FROM unified_api_keys WHERE label = ?').get(k.label);
      if (existing) continue;
      const result = auth.createUnifiedKey({
        label: k.label,
        rateLimitPerMin: k.rateLimitPerMin,
        allowedRoutes: k.allowedRoutes,
        allowedModels: k.allowedModels,
      });
      created.unifiedKeys.push(result);
    }
  }
  res.json({ ok: true, created });
});

export default router;
