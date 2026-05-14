// OpenAI-compatible /v1/* gateway endpoints. These are the public entrypoints
// that external apps call using a Nyth Router unified API key or app token.

import { Router } from 'express';
import { Readable } from 'node:stream';
import db from '../db/connection.js';
import { dispatchChat } from '../services/gateway.js';
import { authenticateGatewayRequest } from '../middleware/gatewayAuth.js';
import { getSettings } from './settings.js';

const router = Router();

async function handleChatCompletions(req, res) {
  const auth = authenticateGatewayRequest(req);
  if (!auth.ok) return res.status(401).json({ error: { message: auth.error, type: 'invalid_request_error' } });
  const body = req.body || {};
  const nonStreamKeepalive = !body.stream ? startNonStreamKeepalive(res, Number(getSettings().nonStreamKeepaliveSeconds || 0)) : null;
  const result = await dispatchChat({
    body,
    app: auth.kind === 'app' ? auth.app : null,
    unifiedKey: auth.kind === 'unified' ? auth.unifiedKey : null,
  });
  if (body.stream && result.status === 200 && !result.response?.error) {
    return sendChatCompletionStream(res, result.response);
  }
  if (nonStreamKeepalive) return nonStreamKeepalive.end(result.status, result.response);
  return res.status(result.status).json(result.response);
}

router.post('/chat/completions', handleChatCompletions);
router.post('/', handleChatCompletions);

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
    data: models.flatMap((m) => {
      const primary = `${m.providerId}/${m.id}`;
      const canonical = {
        id: primary,
        object: 'model',
        created: 0,
        owned_by: m.providerName,
        nyth: {
          provider: m.providerId,
          model: m.id,
          displayName: m.displayName,
          canonical: primary,
          aliases: modelAliases(m.providerId, m.id, m.providerName, m.displayName),
          contextLength: m.contextLength,
          inputPrice: m.inputPrice,
          outputPrice: m.outputPrice,
        },
      };
      return [canonical];
    }),
  });
});

router.post('/embeddings', (req, res) => {
  // TODO: forward to provider embedding adapter once we add one.
  res.status(501).json({
    error: {
      message: 'Embeddings forwarding is not yet implemented in this Nyth Router build.',
      type: 'not_implemented',
    },
  });
});

function modelAliases(providerId, modelId, providerName, displayName) {
  const aliases = new Set([`${providerId}/${modelId}`]);
  // Legacy colon aliases are accepted by the resolver but intentionally hidden
  // from public model menus because slash is the canonical public format.
  if (providerName) aliases.add(`${providerName}, ${displayName || modelId}`);
  for (const alias of oauthProviderAliases(providerId, modelId, displayName)) aliases.add(alias);
  return [...aliases];
}

function oauthProviderAliases(providerId, modelId, displayName) {
  const name = displayName || modelId;
  const map = {
    codex: [`openai-codex/${modelId}`, `OpenAI Codex, ${name}`, `OpenAI Codex OAuth, ${name}`],
    'claude-oauth': [`anthropic-oauth/${modelId}`, `claude-code/${modelId}`, `Claude Code, ${name}`, `Claude Code OAuth, ${name}`],
    'gemini-oauth': [`google-oauth/${modelId}`, `gemini-cli/${modelId}`, `Gemini CLI, ${name}`, `Gemini CLI OAuth, ${name}`],
  };
  return map[providerId] || [];
}

function sendChatCompletionStream(res, response) {
  if (response?.stream) return pipeUpstreamSse(res, response.stream, response.streamKeepaliveSeconds);
  res.status(200);
  res.setHeader('content-type', 'text/event-stream; charset=utf-8');
  res.setHeader('cache-control', 'no-cache, no-transform');
  res.setHeader('connection', 'keep-alive');
  res.flushHeaders?.();

  const id = response.id || `chatcmpl_${Date.now()}`;
  const model = response.model || response.nyth?.model || 'nyth';
  const created = response.created || Math.floor(Date.now() / 1000);
  const choice = response.choices?.[0] || {};
  const message = choice.message || { role: 'assistant', content: '' };

  writeSse(res, {
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
  });

  if (Array.isArray(message.tool_calls) && message.tool_calls.length) {
    message.tool_calls.forEach((toolCall, index) => {
      writeSse(res, {
        id,
        object: 'chat.completion.chunk',
        created,
        model,
        choices: [{
          index: 0,
          delta: {
            tool_calls: [{
              index,
              id: toolCall.id,
              type: toolCall.type || 'function',
              function: {
                name: toolCall.function?.name || '',
                arguments: toolCall.function?.arguments || '',
              },
            }],
          },
          finish_reason: null,
        }],
      });
    });
  } else if (message.content) {
    writeSse(res, {
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{ index: 0, delta: { content: message.content }, finish_reason: null }],
    });
  }

  writeSse(res, {
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [{ index: 0, delta: {}, finish_reason: choice.finish_reason || 'stop' }],
    usage: response.usage,
  });
  res.write('data: [DONE]\n\n');
  res.end();
}

function writeSse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function startNonStreamKeepalive(res, keepaliveSeconds = 0) {
  const keepaliveMs = Number(keepaliveSeconds || 0) > 0 ? Number(keepaliveSeconds) * 1000 : 0;
  if (!keepaliveMs) return null;

  let started = false;
  const timer = setInterval(() => {
    if (res.writableEnded) return;
    if (!started) {
      started = true;
      res.status(200);
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('cache-control', 'no-cache, no-transform');
      res.setHeader('connection', 'keep-alive');
      res.flushHeaders?.();
    }
    res.write('\n');
  }, keepaliveMs);

  const clear = () => clearInterval(timer);
  res.on?.('close', clear);
  res.on?.('finish', clear);

  return {
    end(status, payload) {
      clear();
      if (!started) return res.status(status).json(payload);
      res.statusCode = status;
      res.end(JSON.stringify(payload));
      return res;
    },
  };
}


async function pipeUpstreamSse(res, stream, keepaliveSeconds = 0) {
  res.status(200);
  res.setHeader('content-type', 'text/event-stream; charset=utf-8');
  res.setHeader('cache-control', 'no-cache, no-transform');
  res.setHeader('connection', 'keep-alive');
  res.flushHeaders?.();

  const keepaliveMs = Number(keepaliveSeconds || 0) > 0 ? Number(keepaliveSeconds) * 1000 : 0;
  const keepaliveTimer = keepaliveMs ? setInterval(() => {
    if (!res.writableEnded) res.write(': keepalive\n\n');
  }, keepaliveMs) : null;
  const clearKeepalive = () => { if (keepaliveTimer) clearInterval(keepaliveTimer); };
  res.on?.('close', clearKeepalive);
  res.on?.('finish', clearKeepalive);

  const nodeStream = typeof stream.getReader === 'function' ? Readable.fromWeb(stream) : stream;
  nodeStream.on?.('error', (err) => {
    clearKeepalive();
    if (!res.headersSent) res.status(502);
    if (!res.writableEnded) res.end(`event: error\ndata: ${JSON.stringify({ error: String(err.message || err) })}\n\n`);
  });

  if (typeof res.on === 'function' && typeof res.once === 'function' && typeof res.emit === 'function') {
    nodeStream.on?.('end', clearKeepalive);
    nodeStream.pipe(res);
    return;
  }

  try {
    for await (const chunk of nodeStream) {
      res.write(chunk);
    }
    res.end();
  } finally {
    clearKeepalive();
  }
}
export default router;
