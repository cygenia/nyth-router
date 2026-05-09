import { Router } from 'express';
import db from '../db/connection.js';
import { requireDashboard } from '../middleware/auth.js';
import { config } from '../config.js';

const router = Router();

router.use(requireDashboard);

const upsertSetting = db.prepare(`
  INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
`);

const DEFAULTS = {
  defaultRoute: 'bigliner-smart',
  defaultModelAlias: 'bigliner-smart',
  timeoutMs: '120000',
  retryCount: '1',
  maxFallbackDepth: '4',
  promptLogMode: config.promptLogMode,
  logRetentionDays: String(config.logRetentionDays),
  theme: 'aurora-dark',
};

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const merged = { ...DEFAULTS, ...map };
  res.json({
    ok: true,
    settings: merged,
    runtime: {
      host: config.host,
      port: config.port,
      promptLogMode: config.promptLogMode,
      logRetentionDays: config.logRetentionDays,
      dataDir: '<local>',
    },
  });
});

router.put('/', (req, res) => {
  const payload = req.body || {};
  const tx = db.transaction(() => {
    for (const [key, value] of Object.entries(payload)) {
      if (typeof value === 'string') {
        upsertSetting.run(key, value, Date.now());
      }
    }
  });
  tx();
  res.json({ ok: true });
});

router.post('/reset-database', (req, res) => {
  // Wipe all user data tables but keep registry-derived rows.
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM provider_keys').run();
    db.prepare('DELETE FROM unified_api_keys').run();
    db.prepare('DELETE FROM apps').run();
    db.prepare('DELETE FROM app_tokens').run();
    db.prepare('DELETE FROM routes').run();
    db.prepare('DELETE FROM route_steps').run();
    db.prepare('DELETE FROM request_logs').run();
    db.prepare('DELETE FROM fallback_events').run();
    db.prepare('DELETE FROM usage_daily').run();
    db.prepare('DELETE FROM prompt_fingerprints').run();
    db.prepare('DELETE FROM sessions').run();
    db.prepare('DELETE FROM settings').run();
  });
  tx();
  res.json({ ok: true });
});

export default router;
