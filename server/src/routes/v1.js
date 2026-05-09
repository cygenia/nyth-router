// OpenAI-compatible /v1/* gateway endpoints. These are the public entrypoints
// that external apps call using a Bigliner unified API key (bl_...) or app
// token (blat_...).

import { Router } from 'express';
import db from '../db/connection.js';
import { dispatchChat } from '../services/gateway.js';
import { authenticateGatewayRequest } from '../middleware/gatewayAuth.js';

const router = Router();

router.post('/chat/completions', async (req, res) => {
  const auth = authenticateGatewayRequest(req);
  if (!auth.ok) return res.status(401).json({ error: { message: auth.error, type: 'invalid_request_error' } });
  const result = await dispatchChat({
    body: req.body || {},
    app: auth.kind === 'app' ? auth.app : null,
    unifiedKey: auth.kind === 'unified' ? auth.unifiedKey : null,
  });
  res.status(result.status).json(result.response);
});

router.get('/models', (req, res) => {
  const models = db.prepare(`
    SELECT m.id, m.display_name AS displayName, m.provider_id AS providerId,
           p.name AS providerName, m.context_length AS contextLength,
           m.input_price AS inputPrice, m.output_price AS outputPrice
    FROM models m JOIN providers p ON p.id = m.provider_id
    ORDER BY m.id ASC
  `).all();
  res.json({
    object: 'list',
    data: models.map((m) => ({
      id: `${m.providerId}:${m.id}`,
      object: 'model',
      created: 0,
      owned_by: m.providerName,
      bigliner: {
        provider: m.providerId,
        contextLength: m.contextLength,
        inputPrice: m.inputPrice,
        outputPrice: m.outputPrice,
      },
    })),
  });
});

router.post('/embeddings', (req, res) => {
  // TODO: forward to provider embedding adapter once we add one.
  res.status(501).json({
    error: {
      message: 'Embeddings forwarding is not yet implemented in this Bigliner build.',
      type: 'not_implemented',
    },
  });
});

export default router;
