// Anthropic adapter. Converts an OpenAI-shaped request into Anthropic's
// /v1/messages format and the response back into OpenAI's chat-completion
// shape so Nyth Router can stay OpenAI-compatible end-to-end.

const DEFAULT_VERSION = '2023-06-01';

export async function forwardChat({ baseUrl, apiKey, body, signal }) {
  const url = trimTrailingSlash(baseUrl) + '/v1/messages';
  const anthropicBody = openAiToAnthropic(body);
  const headers = {
    'content-type': 'application/json',
    'anthropic-version': DEFAULT_VERSION,
  };
  if (apiKey) headers['x-api-key'] = apiKey;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(anthropicBody),
    signal,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      statusText: res.statusText,
      data,
      rawText: text,
      headers: Object.fromEntries(res.headers.entries()),
    };
  }
  return {
    ok: true,
    status: res.status,
    statusText: res.statusText,
    data: anthropicToOpenAi(data, body.model),
    rawText: text,
    headers: Object.fromEntries(res.headers.entries()),
  };
}

export function openAiToAnthropic(req) {
  const messages = Array.isArray(req.messages) ? req.messages : [];
  const systemParts = [];
  const out = [];
  for (const m of messages) {
    if (m.role === 'system') {
      if (typeof m.content === 'string') systemParts.push(m.content);
      else if (Array.isArray(m.content)) {
        for (const part of m.content) {
          if (typeof part === 'string') systemParts.push(part);
          else if (part?.text) systemParts.push(part.text);
        }
      }
      continue;
    }
    if (m.role === 'tool') {
      out.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: stringify(m.content) }],
      });
      continue;
    }
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    out.push({ role, content: normaliseContent(m.content) });
  }
  const result = {
    model: req.model,
    messages: out,
    max_tokens: Number(req.max_tokens || req.max_completion_tokens || 1024),
  };
  if (systemParts.length) result.system = systemParts.join('\n\n');
  if (req.temperature != null) result.temperature = req.temperature;
  if (req.top_p != null) result.top_p = req.top_p;
  if (req.stop) result.stop_sequences = Array.isArray(req.stop) ? req.stop : [req.stop];
  return result;
}

export function anthropicToOpenAi(resp, model) {
  if (!resp || resp.error) {
    return resp;
  }
  let content = '';
  if (Array.isArray(resp.content)) {
    for (const part of resp.content) {
      if (part.type === 'text' && part.text) content += part.text;
    }
  }
  const id = resp.id || `chatcmpl_${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  return {
    id,
    object: 'chat.completion',
    created,
    model: resp.model || model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: mapStop(resp.stop_reason),
      },
    ],
    usage: {
      prompt_tokens: resp.usage?.input_tokens || 0,
      completion_tokens: resp.usage?.output_tokens || 0,
      total_tokens: (resp.usage?.input_tokens || 0) + (resp.usage?.output_tokens || 0),
    },
  };
}

function mapStop(reason) {
  switch (reason) {
    case 'end_turn': return 'stop';
    case 'max_tokens': return 'length';
    case 'tool_use': return 'tool_calls';
    case 'stop_sequence': return 'stop';
    default: return 'stop';
  }
}

function normaliseContent(content) {
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === 'string') return { type: 'text', text: part };
      if (part?.type === 'text') return { type: 'text', text: part.text || '' };
      if (part?.type === 'image_url') {
        const url = typeof part.image_url === 'string' ? part.image_url : part.image_url?.url;
        if (url?.startsWith('data:')) {
          const [, mediaType, b64] = url.match(/data:([^;]+);base64,(.*)/) || [];
          if (mediaType && b64) {
            return { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } };
          }
        }
        return { type: 'image', source: { type: 'url', url } };
      }
      return { type: 'text', text: stringify(part) };
    });
  }
  return [{ type: 'text', text: stringify(content) }];
}

function stringify(value) {
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function trimTrailingSlash(url) {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

export async function ping({ baseUrl, apiKey, signal }) {
  // Anthropic doesn't expose a cheap GET; do a minimal POST with 1 token.
  try {
    const url = trimTrailingSlash(baseUrl) + '/v1/messages';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'anthropic-version': DEFAULT_VERSION,
        'x-api-key': apiKey || '',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      }),
      signal,
    });
    if (res.status === 401) return { ok: false, status: 401, error: 'unauthorized' };
    if (!res.ok) {
      const txt = await res.text();
      return { ok: false, status: res.status, error: txt.slice(0, 200) };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    return { ok: false, status: 0, error: String(err.message || err) };
  }
}
