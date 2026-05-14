import { Router } from 'express';
import { requireDashboard } from '../middleware/auth.js';
import * as logger from '../services/requestLogger.js';

const router = Router();

router.use(requireDashboard);

router.get('/', (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit || 50)));
  const offset = Math.max(0, Number(req.query.offset || 0));
  const logs = logger.listLogs({
    limit,
    offset,
    providerId: req.query.providerId,
    appId: req.query.appId,
    status: req.query.status,
    since: req.query.since,
    q: req.query.q,
  });
  res.json({ ok: true, logs });
});

router.get('/export.csv', (req, res) => {
  const logs = logger.listLogs({ limit: 1000, offset: 0 });
  res.setHeader('content-type', 'text/csv; charset=utf-8');
  res.setHeader('content-disposition', 'attachment; filename="nyth-logs.csv"');
  const header = 'ts,app,route,provider,model,inputTokens,outputTokens,estimatedCost,latencyMs,status';
  const rows = logs.map((l) => [
    new Date(l.ts).toISOString(),
    JSON.stringify(l.appName || ''),
    JSON.stringify(l.routeAlias || ''),
    JSON.stringify(l.providerId || ''),
    JSON.stringify(l.model || ''),
    l.inputTokens,
    l.outputTokens,
    l.estimatedCost,
    l.latencyMs,
    JSON.stringify(l.status || ''),
  ].join(','));
  res.end([header, ...rows].join('\n'));
});

export default router;
