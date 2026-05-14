import { Router } from 'express';
import { requireDashboard } from '../middleware/auth.js';
import { dispatchChat } from '../services/gateway.js';
import { resolveModel } from '../services/routeEngine.js';
import { compareAcrossModels } from '../services/costCalculator.js';
import { estimateMessages } from '../services/tokenizer.js';
import { listAvailableModels } from '../services/modelAvailability.js';

const router = Router();

router.use(requireDashboard);

router.get('/models', (req, res) => {
  res.json({ ok: true, ...listAvailableModels() });
});

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
  const baseUrl = normalizeBaseUrl(String(req.body?.baseUrl || `http://localhost:9879/v1`));
  const model = String(req.body?.model || 'nyth-smart');
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [{ role: 'user', content: 'Hello, Nyth Router!' }];
  const apiKey = String(req.body?.apiKey || 'YOUR_UNIFIED_KEY');
  const cmd = `curl ${baseUrl} \\
  -H "authorization: Bearer ***" \\
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


function normalizeBaseUrl(value) {
  const trimmed = String(value || '').replace(/\/+$/, '');
  if (!trimmed) return 'http://localhost:9879/v1/chat/completions';
  if (trimmed.endsWith('/v1/chat/completions')) return trimmed;
  if (trimmed.endsWith('/v1')) return trimmed + '/chat/completions';
  return trimmed + '/v1/chat/completions';
}

export default router;
