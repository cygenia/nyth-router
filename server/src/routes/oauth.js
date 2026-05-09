import { Router } from 'express';
import { requireDashboard } from '../middleware/auth.js';
import * as auth from '../services/auth.js';

const router = Router();

// Dashboard endpoints (require dashboard session)
const dashboard = Router();
dashboard.use(requireDashboard);

dashboard.get('/apps', (req, res) => {
  res.json({ ok: true, apps: auth.listApps() });
});

dashboard.post('/apps', (req, res) => {
  const created = auth.createApp(req.body || {});
  res.status(201).json({ ok: true, app: created });
});

dashboard.delete('/apps/:id', (req, res) => {
  auth.deleteApp(req.params.id);
  res.json({ ok: true });
});

dashboard.post('/apps/:id/rotate', (req, res) => {
  const cs = auth.rotateClientSecret(req.params.id);
  res.json({ ok: true, clientSecret: cs });
});

dashboard.get('/apps/:id/tokens', (req, res) => {
  res.json({ ok: true, tokens: auth.listAppTokens(req.params.id) });
});

dashboard.post('/apps/:id/tokens', (req, res) => {
  const issued = auth.issueAppToken({
    appId: req.params.id,
    scopes: req.body?.scopes,
    ttlSeconds: req.body?.ttlSeconds,
  });
  res.status(201).json({ ok: true, token: issued });
});

dashboard.post('/tokens/:id/revoke', (req, res) => {
  auth.revokeAppToken(req.params.id);
  res.json({ ok: true });
});

// Unified API key management
dashboard.get('/unified-keys', (req, res) => {
  res.json({ ok: true, keys: auth.listUnifiedKeys() });
});

dashboard.post('/unified-keys', (req, res) => {
  const created = auth.createUnifiedKey(req.body || {});
  res.status(201).json({ ok: true, key: created });
});

dashboard.post('/unified-keys/:id/rotate', (req, res) => {
  const rotated = auth.rotateUnifiedKey(req.params.id);
  res.json({ ok: true, key: rotated });
});

dashboard.post('/unified-keys/:id/revoke', (req, res) => {
  auth.revokeUnifiedKey(req.params.id);
  res.json({ ok: true });
});

dashboard.delete('/unified-keys/:id', (req, res) => {
  auth.deleteUnifiedKey(req.params.id);
  res.json({ ok: true });
});

router.use(dashboard);

export default router;
