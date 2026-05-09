import { Router } from 'express';
import { requireDashboard } from '../middleware/auth.js';
import { dispatchChat } from '../services/gateway.js';
import { resolveModel } from '../services/routeEngine.js';
import { compareAcrossModels } from '../services/costCalculator.js';
import { estimateMessages } from '../services/tokenizer.js';

const router = Router();

router.use(requireDashboard);

router.post('/run', async (req, res) => {
  const body = req.body?.request || {};
  if (!body.model || !Array.isArray(body.messages)) {
    return res.status(400).json({ ok: false, error: 'model_and_messages_required' });
  }
  const result = await dispatchChat({ body, app: { appName: 'Playground' } });
  res.status(result.status).json({ ok: result.status === 200, result: result.response, decision: result.decision });
});

router.post('/decision', (req, res) => {
  const model = String(req.body?.model || '');
  res.json({ ok: true, decision: resolveModel(model) });
});

router.post('/curl', (req, res) => {
  const baseUrl = String(req.body?.baseUrl || `http://localhost:9879`);
  const model = String(req.body?.model || 'bigliner-smart');
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [{ role: 'user', content: 'Hello, Bigliner!' }];
  const apiKey = String(req.body?.apiKey || 'bl_YOUR_UNIFIED_KEY');
  const cmd = `curl ${baseUrl}/v1/chat/completions \\
  -H "authorization: Bearer ${apiKey}" \\
  -H "content-type: application/json" \\
  --data '${JSON.stringify({ model, messages }).replace(/'/g, "\\'")}'`;
  res.json({ ok: true, curl: cmd });
});

router.post('/estimate', (req, res) => {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const inputTokens = estimateMessages(messages);
  const outputTokens = Math.max(64, Math.round(inputTokens * 0.6));
  const cheapest = compareAcrossModels({ inputTokens, outputTokens }).slice(0, 8);
  res.json({ ok: true, inputTokens, outputTokensEstimate: outputTokens, cheapest });
});

export default router;
