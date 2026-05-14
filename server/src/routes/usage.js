import { Router } from 'express';
import { requireDashboard } from '../middleware/auth.js';
import * as analytics from '../services/analytics.js';
import { compareAcrossModels, getPricingCoverage } from '../services/costCalculator.js';

const router = Router();

router.use(requireDashboard);

router.get('/overview', (req, res) => {
  res.json({ ok: true, overview: analytics.getOverview() });
});

router.get('/daily', (req, res) => {
  const days = Math.min(60, Math.max(1, Number(req.query.days || 14)));
  res.json({ ok: true, days, daily: analytics.getDailyUsage(days) });
});

router.get('/by-provider', (req, res) => {
  res.json({ ok: true, byProvider: analytics.getUsageByProvider(Number(req.query.days) || 14) });
});

router.get('/by-model', (req, res) => {
  res.json({ ok: true, byModel: analytics.getUsageByModel(Number(req.query.days) || 14) });
});

router.get('/by-app', (req, res) => {
  res.json({ ok: true, byApp: analytics.getUsageByApp(Number(req.query.days) || 14) });
});

router.get('/insights', (req, res) => {
  res.json({ ok: true, insights: analytics.getInsights() });
});

router.get('/fallbacks', (req, res) => {
  res.json({ ok: true, fallbacks: analytics.getRecentFallbacks(Number(req.query.limit) || 20) });
});

router.get('/pricing-coverage', (req, res) => {
  res.json({ ok: true, coverage: getPricingCoverage(Number(req.query.days) || 14) });
});

router.post('/cheaper-route', (req, res) => {
  const inputTokens = Number(req.body?.inputTokens || 1000);
  const outputTokens = Number(req.body?.outputTokens || 500);
  res.json({
    ok: true,
    cheapest: compareAcrossModels({ inputTokens, outputTokens }).slice(0, 12),
  });
});

router.get('/export.csv', (req, res) => {
  const data = analytics.getDailyUsage(60);
  res.setHeader('content-type', 'text/csv; charset=utf-8');
  res.setHeader('content-disposition', 'attachment; filename="nyth-daily-usage.csv"');
  const header = 'day,requests,input_tokens,output_tokens,estimated_cost,errors';
  const rows = data.map((r) => `${r.day},${r.requests},${r.inputTokens},${r.outputTokens},${r.estimatedCost},${r.errors}`);
  res.end([header, ...rows].join('\n'));
});

export default router;
