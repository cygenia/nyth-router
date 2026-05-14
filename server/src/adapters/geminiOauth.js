// Gemini CLI OAuth adapter.
//
// Google account OAuth tokens from the Gemini CLI flow are cloud-platform
// tokens, not Generative Language API keys. The public
// generativelanguage.googleapis.com OpenAI-compatible surface rejects those
// with insufficient scopes, so account-OAuth traffic must use the Code Assist
// API surface that Gemini CLI itself uses.

const CODE_ASSIST_ENDPOINT = 'https://cloudcode-pa.googleapis.com/v1internal:generateContent';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';
const GEMINI_USER_AGENT = 'GeminiCLI/0.31.0/unknown (linux; x64)';
const GEMINI_API_CLIENT = 'google-genai-sdk/1.41.0 gl-node/v22.19.0';

export async function forwardChat({ apiKey, body, credential, signal }) {
  const payload = openAiToCodeAssist(body, credential);
  const res = await fetch(CODE_ASSIST_ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey || ''}`,
      'content-type': 'application/json',
      'user-agent': GEMINI_USER_AGENT,
      'x-goog-api-client': GEMINI_API_CLIENT,
      accept: 'application/json',
    },
    body: JSON.stringify(payload),
    signal,
  });
  const text = await res.text();
  const data = parseJson(text);
  if (!res.ok) {
    return { ok: false, status: res.status, statusText: res.statusText, data, rawText: text, headers: Object.fromEntries(res.headers.entries()) };
  }
  return {
    ok: true,
    status: res.status,
    statusText: res.statusText,
    data: codeAssistToOpenAi(data, body.model),
    rawText: text,
    headers: Object.fromEntries(res.headers.entries()),
  };
}

export async function ping({ apiKey, signal }) {
  // Cheap scope/token check. It validates OAuth identity without touching the
  // Generative Language API, avoiding false PERMISSION_DENIED scope failures.
  try {
    const res = await fetch(USERINFO_ENDPOINT, {
      headers: { authorization: `Bearer ${apiKey || ''}`, accept: 'application/json' },
      signal,
    });
    const text = await res.text();
    if (res.ok) return { ok: true, status: res.status, planName: 'Google account' };
    return { ok: false, status: res.status, error: extractError(parseJson(text), text) };
  } catch (err) {
    return { ok: false, status: 0, error: String(err.message || err) };
  }
}


export async function listModels({ apiKey, signal }) {
  try {
    const res = await fetch('https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey || ''}`,
        'content-type': 'application/json',
        'user-agent': GEMINI_USER_AGENT,
        'x-goog-api-client': GEMINI_API_CLIENT,
        accept: 'application/json',
      },
      body: JSON.stringify({}),
      signal,
    });
    const text = await res.text();
    const data = parseJson(text);
    if (!res.ok) return { ok: false, status: res.status, error: extractError(data, text), data };
    const models = normalizeModelList(data);
    return { ok: true, status: res.status, data: { models } };
  } catch (err) {
    return { ok: false, status: 0, error: String(err.message || err) };
  }
}

function normalizeModelList(data) {
  const raw = data?.models || data?.availableModels || data?.response?.models || [];
  return raw.map((item) => {
    if (typeof item === 'string') return item;
    return item?.name || item?.id || item?.model || item?.modelId || '';
  }).map((id) => String(id).split('/').pop()).filter(Boolean).filter((id, idx, arr) => arr.indexOf(id) === idx);
}

export function openAiToCodeAssist(req, credential = null) {
  const contents = [];
  const systemParts = [];
  for (const msg of req.messages || []) {
    if (msg.role === 'system') {
      systemParts.push(contentToText(msg.content));
      continue;
    }
    if (msg.role === 'tool') {
      contents.push({ role: 'user', parts: [{ text: `Tool result: ${contentToText(msg.content)}` }] });
      continue;
    }
    const role = msg.role === 'assistant' ? 'model' : 'user';
    contents.push({ role, parts: [{ text: contentToText(msg.content) }] });
  }
  if (!contents.length) contents.push({ role: 'user', parts: [{ text: contentToText(req.prompt || 'ping') }] });
  const googleProject = credential?.googleProject || credential?.metadata?.googleProject || req.nyth?.googleProject || req.project || '';
  const request = {
    model: req.model,
    project: googleProject,
    request: {
      contents,
      generationConfig: {},
    },
  };
  if (systemParts.length) request.request.systemInstruction = { parts: [{ text: systemParts.join('\n\n') }] };
  if (req.temperature != null) request.request.generationConfig.temperature = req.temperature;
  if (req.top_p != null) request.request.generationConfig.topP = req.top_p;
  if (req.max_tokens || req.max_completion_tokens) request.request.generationConfig.maxOutputTokens = Number(req.max_tokens || req.max_completion_tokens);
  if (Array.isArray(req.tools) && req.tools.length) {
    request.request.tools = [{ functionDeclarations: req.tools.map((t) => t.function).filter(Boolean) }];
  }
  return request;
}

export function codeAssistToOpenAi(resp, model) {
  const candidate = resp?.response?.candidates?.[0] || resp?.candidates?.[0] || resp?.candidate || {};
  const parts = candidate?.content?.parts || candidate?.parts || [];
  let content = '';
  const toolCalls = [];
  for (const part of parts) {
    if (part.text) content += part.text;
    if (part.functionCall) {
      toolCalls.push({
        id: `call_${Math.random().toString(36).slice(2, 12)}`,
        type: 'function',
        function: { name: part.functionCall.name, arguments: JSON.stringify(part.functionCall.args || {}) },
      });
    }
  }
  const usage = resp?.response?.usageMetadata || resp?.usageMetadata || {};
  const message = { role: 'assistant', content: content || null };
  if (toolCalls.length) message.tool_calls = toolCalls;
  return {
    id: resp?.response?.responseId || resp?.responseId || `chatcmpl_${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message, finish_reason: toolCalls.length ? 'tool_calls' : mapFinish(candidate.finishReason) }],
    usage: {
      prompt_tokens: usage.promptTokenCount || usage.inputTokenCount || 0,
      completion_tokens: usage.candidatesTokenCount || usage.outputTokenCount || 0,
      total_tokens: usage.totalTokenCount || ((usage.promptTokenCount || 0) + (usage.candidatesTokenCount || 0)),
    },
  };
}

function contentToText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((p) => typeof p === 'string' ? p : (p.text || p.content || p.image_url?.url || JSON.stringify(p))).join('\n');
  if (content == null) return '';
  try { return JSON.stringify(content); } catch { return String(content); }
}

function mapFinish(reason) {
  const value = String(reason || '').toUpperCase();
  if (value === 'MAX_TOKENS') return 'length';
  if (value === 'STOP') return 'stop';
  return 'stop';
}

function parseJson(text) {
  try { return text ? JSON.parse(text) : null; } catch { return { raw: text }; }
}

function extractError(data, text) {
  return data?.error?.message || data?.message || String(text || '').slice(0, 240) || 'request_failed';
}
