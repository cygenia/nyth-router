import { Router } from 'express';
import { requireDashboard } from '../middleware/auth.js';
import * as auth from '../services/auth.js';
import { autoImportKiroAccount, autoRepairKiroAccount, createPkceSession, deleteConnectedAccount, getOauthStatus, handleCallback, importKiroRefreshToken, listPkceProviders, setDefaultConnectedAccount, submitCallbackUrl } from '../services/oauthPkce.js';
import { listProviderAccountsWithInsights, refreshAllProviderAccountInsights, testAllProviderAccounts, testProviderAccount } from '../services/oauthInsights.js';

const router = Router();

// Dashboard endpoints (require dashboard session)
function publicOrigin(req) {
  return process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
}

router.get('/callback/:provider', async (req, res) => {
  const result = await handleCallback(req.params.provider, req.query || {});
  const color = result.ok ? '#10b981' : '#ef4444';
  res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><title>Nyth Router OAuth</title><style>body{font-family:Inter,system-ui,sans-serif;background:#080817;color:#f8fafc;display:grid;place-items:center;min-height:100vh;margin:0}.card{max-width:560px;border:1px solid rgba(255,255,255,.12);border-radius:28px;padding:28px;background:rgba(255,255,255,.06)}.dot{width:12px;height:12px;border-radius:999px;background:${color};display:inline-block}code{display:block;white-space:pre-wrap;word-break:break-word;background:rgba(255,255,255,.08);padding:12px;border-radius:14px}</style></head><body><main class="card"><p><span class="dot"></span></p><h1>${result.ok ? 'Connected' : 'OAuth callback received'}</h1><p>${escapeHtml(result.provider || req.params.provider)}: ${escapeHtml(result.status || result.error || 'done')}</p><code>${escapeHtml(JSON.stringify(result, null, 2))}</code><p>You can close this tab and return to Nyth Router.</p></main></body></html>`);
});

const dashboard = Router();
dashboard.use(requireDashboard);

dashboard.get('/providers', (req, res) => {
  res.json({ ok: true, providers: listPkceProviders() });
});

dashboard.post('/providers/:provider/start', (req, res) => {
  const session = createPkceSession(req.params.provider);
  res.status(201).json({ ok: true, session });
});

dashboard.post('/providers/:provider/callback', async (req, res) => {
  const result = await submitCallbackUrl(req.params.provider, req.body?.callbackUrl || '');
  res.status(result.ok ? 200 : 400).json(result);
});

dashboard.post('/providers/kiro/import', async (req, res) => {
  const result = await importKiroRefreshToken(req.body?.refreshToken || '');
  res.status(result.ok ? 200 : 400).json(result);
});

dashboard.post('/providers/kiro/auto-import', async (req, res) => {
  const result = await autoImportKiroAccount();
  res.status(result.ok ? 200 : 400).json(result);
});

dashboard.get('/status', (req, res) => {
  res.json({ ok: true, ...getOauthStatus() });
});

dashboard.get('/apps', (req, res) => {
  res.json({ ok: true, apps: auth.listApps(), providerAccounts: listProviderAccountsWithInsights() });
});

dashboard.get('/provider-accounts', (req, res) => {
  res.json({ ok: true, accounts: listProviderAccountsWithInsights() });
});

dashboard.post('/provider-accounts/refresh', async (req, res) => {
  const summary = await refreshAllProviderAccountInsights();
  res.json({ ok: true, ...summary, accounts: listProviderAccountsWithInsights() });
});

dashboard.post('/provider-accounts/test-all', async (req, res) => {
  const summary = await testAllProviderAccounts();
  res.json({ ok: true, ...summary, accounts: listProviderAccountsWithInsights() });
});

dashboard.post('/provider-accounts/:provider/:accountId/test', async (req, res) => {
  const result = await testProviderAccount(req.params.provider, req.params.accountId);
  res.status(result.ok ? 200 : 400).json(result);
});

dashboard.post('/provider-accounts/:provider/:accountId/repair', async (req, res) => {
  if (req.params.provider !== 'kiro') return res.status(400).json({ ok: false, error: 'repair_supported_for_kiro_only' });
  const result = await autoRepairKiroAccount(req.params.accountId);
  res.status(result.ok ? 200 : 400).json(result);
});

dashboard.post('/provider-accounts/:provider/:accountId/default', (req, res) => {
  setDefaultConnectedAccount(req.params.provider, req.params.accountId);
  res.json({ ok: true });
});

dashboard.delete('/provider-accounts/:provider/:accountId', (req, res) => {
  deleteConnectedAccount(req.params.provider, req.params.accountId);
  res.json({ ok: true });
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
  try {
    const created = auth.createUnifiedKey(req.body || {});
    res.status(201).json({ ok: true, key: created });
  } catch (err) {
    res.status(400).json({ ok: false, error: String(err.message || err) });
  }
});

dashboard.post('/unified-keys/:id/rotate', (req, res) => {
  const rotated = auth.rotateUnifiedKey(req.params.id);
  res.json({ ok: true, key: rotated });
});

dashboard.post('/unified-keys/:id/reveal', (req, res) => {
  const revealed = auth.revealUnifiedKey(req.params.id);
  if (!revealed) return res.status(404).json({ ok: false, error: 'key_not_revealable' });
  return res.json({ ok: true, key: revealed });
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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default router;
