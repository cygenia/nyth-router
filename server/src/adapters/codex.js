import { randomUUID } from 'node:crypto';

export async function forwardChat({ baseUrl, apiKey, body, signal, credential }) {
  const url = trimTrailingSlash(baseUrl || 'https://chatgpt.com/backend-api/codex') + '/responses';
  const requestBody = toCodexResponsesBody(body);
  const res = await fetch(url, {
    method: 'POST',
    headers: codexHeaders(apiKey, true, credential),
    body: JSON.stringify(requestBody),
    signal,
  });
  const text = await res.text();
  if (!res.ok) return responseFromError(res, text);
  return responseFromCodexSse(res, text, body?.model || requestBody.model);
}

export async function listModels() {
  return { ok: true, status: 200, data: { object: 'list', data: [] } };
}

export async function ping({ baseUrl, apiKey, signal }) {
  const result = await forwardChat({
    baseUrl,
    apiKey,
    signal,
    body: { model: 'gpt-5.5-mini', messages: [{ role: 'user', content: 'ping' }], max_tokens: 8 },
  });
  return { ok: result.ok, status: result.status, error: result.ok ? undefined : result.error || result.data?.error?.message };
}

function toCodexResponsesBody(body = {}) {
  const messages = body.messages || [];
  const instructions = messages
    .filter((m) => m.role === 'system')
    .map((m) => contentToText(m.content))
    .join('\n');
  const input = messages
    .filter((m) => m.role !== 'system')
    .flatMap(messageToResponseItems)
    .filter(Boolean);
  const request = {
    model: body.model || 'gpt-5.5',
    instructions,
    input: input.length ? input : [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: String(body.prompt || '') }] }],
    stream: true,
    store: false,
    parallel_tool_calls: body.parallel_tool_calls ?? true,
    reasoning: { effort: body.reasoning_effort || body.reasoning?.effort || 'medium', summary: 'auto' },
    include: ['reasoning.encrypted_content'],
  };
  const tools = normalizeTools(body.tools);
  if (tools.length) request.tools = tools;
  if (body.tool_choice) request.tool_choice = normalizeToolChoice(body.tool_choice);
  return request;
}

function messageToResponseItems(message) {
  if (message.role === 'tool') {
    return [{
      type: 'function_call_output',
      call_id: toCodexCallId(message.tool_call_id || message.call_id || ''),
      output: contentToText(message.content),
    }];
  }
  const items = [];
  if (Array.isArray(message.tool_calls) && message.tool_calls.length) {
    if (contentToText(message.content)) {
      items.push({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: contentToText(message.content) }] });
    }
    const seen = new Set();
    for (const call of message.tool_calls) {
      const item = chatToolCallToResponseItem(call);
      if (!item || seen.has(item.call_id)) continue;
      seen.add(item.call_id);
      items.push(item);
    }
    return items.filter(Boolean);
  }
  return [{
    type: 'message',
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: [{ type: message.role === 'assistant' ? 'output_text' : 'input_text', text: contentToText(message.content) }],
  }];
}

function chatToolCallToResponseItem(call) {
  const fn = call?.function || {};
  const codexId = toCodexCallId(call?.id || call?.call_id || '');
  return {
    type: 'function_call',
    id: codexId,
    call_id: codexId,
    name: fn.name || call?.name || '',
    arguments: typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments || call?.arguments || {}),
  };
}

function normalizeTools(tools = []) {
  return (tools || []).map((tool) => {
    if (tool?.type === 'function') {
      const fn = tool.function || {};
      return {
        type: 'function',
        name: fn.name || tool.name,
        description: fn.description || tool.description || '',
        parameters: fn.parameters || tool.parameters || { type: 'object', properties: {} },
        strict: fn.strict ?? tool.strict ?? false,
      };
    }
    return tool;
  });
}

function normalizeToolChoice(choice) {
  if (choice === 'auto' || choice === 'none' || choice === 'required') return choice;
  if (choice?.type === 'function') return { type: 'function', name: choice.function?.name || choice.name };
  return choice;
}

function contentToText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part) => part?.text || part?.content || '').filter(Boolean).join('\n');
  return content == null ? '' : String(content);
}

function toCodexCallId(id) {
  const value = String(id || '').trim();
  if (value.startsWith('fc-')) return value;
  if (value.startsWith('fc_')) return `fc-${sanitizeCallIdSuffix(value.slice(3))}`;
  if (value.startsWith('call_')) return `fc-${sanitizeCallIdSuffix(value.slice(5))}`;
  if (value.startsWith('tooluse_')) return `fc-${sanitizeCallIdSuffix(value.slice(8))}`;
  if (value) return `fc-${sanitizeCallIdSuffix(value)}`;
  return `fc-${randomUUID().replaceAll('-', '')}`;
}

function sanitizeCallIdSuffix(value) {
  const sanitized = String(value || '').replace(/[^A-Za-z0-9_-]/g, '');
  return sanitized || randomUUID().replaceAll('-', '');
}

function toChatCallId(id) {
  const value = String(id || '');
  if (value.startsWith('call_')) return value;
  if (value.startsWith('fc_')) return `call_${value.slice(3)}`;
  if (value.startsWith('fc-')) return `call_${value.slice(3)}`;
  return value || `call_${randomUUID().replaceAll('-', '')}`;
}

function codexHeaders(token, stream, credential) {
  const headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${token || ''}`,
    'user-agent': 'codex_cli_rs/0.116.0 (Mac OS 26.0.1; arm64) Apple_Terminal/464',
    session_id: randomUUID(),
    'x-codex-turn-metadata': '',
    'x-client-request-id': randomUUID(),
    connection: 'Keep-Alive',
    originator: 'codex_cli_rs',
    accept: stream ? 'text/event-stream' : 'application/json',
  };
  const accountId = credential?.accountSubject || decodeCodexAccountId(token);
  if (accountId) headers['chatgpt-account-id'] = accountId;
  return headers;
}

function decodeCodexAccountId(token) {
  const parts = String(token || '').split('.');
  if (parts.length < 2) return '';
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload?.['https://api.openai.com/auth']?.chatgpt_account_id || '';
  } catch {
    return '';
  }
}

function responseFromCodexSse(res, text, model) {
  let completed = null;
  const completedItems = [];
  const deltas = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const event = JSON.parse(payload);
      if (event.type === 'response.completed') completed = event.response || event;
      if (Array.isArray(event.response?.output)) completedItems.push(...event.response.output);
      if (event.item) completedItems.push(event.item);
      const delta = event.delta || event.text || event.output_text;
      if (typeof delta === 'string') deltas.push(delta);
    } catch {}
  }
  const outputItems = completed?.output?.length ? completed.output : completedItems;
  const toolCalls = extractToolCalls(outputItems);
  const outputText = extractTextFromItems(outputItems) || (toolCalls.length ? '' : deltas.join('').trim());
  const message = { role: 'assistant', content: outputText };
  if (toolCalls.length) {
    message.tool_calls = toolCalls;
    message.content = outputText || null;
  }
  return {
    ok: true,
    status: res.status,
    statusText: res.statusText,
    data: {
      id: completed?.id || `chatcmpl_${randomUUID()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{ index: 0, message, finish_reason: toolCalls.length ? 'tool_calls' : (completed?.status === 'completed' ? 'stop' : null) }],
      usage: normalizeUsage(completed?.usage),
    },
    rawText: text,
    headers: Object.fromEntries(res.headers.entries()),
  };
}

function extractTextFromItems(items) {
  const pieces = [];
  for (const item of items || []) {
    if (item?.type === 'function_call') continue;
    if (Array.isArray(item?.content)) pieces.push(extractTextFromContent(item.content));
    if (typeof item?.text === 'string') pieces.push(item.text);
    if (typeof item?.output_text === 'string') pieces.push(item.output_text);
  }
  return pieces.filter(Boolean).join('\n').trim();
}

function extractTextFromContent(content) {
  const pieces = [];
  for (const part of content || []) {
    if (typeof part?.text === 'string') pieces.push(part.text);
  }
  return pieces.join('');
}

function extractToolCalls(items) {
  const byId = new Map();
  for (const item of items || []) {
    if (item?.type !== 'function_call') continue;
    const nativeId = item.id || item.call_id || '';
    const callId = toChatCallId(item.call_id || item.id || '');
    const key = nativeId || callId;
    const args = typeof item.arguments === 'string' ? item.arguments : JSON.stringify(item.arguments || {});
    const previous = byId.get(key);
    if (previous && previous.function.arguments && !isBetterToolCallArgs(args, previous.function.arguments)) continue;
    byId.set(key, {
      id: callId,
      type: 'function',
      function: {
        name: item.name || item.function?.name || previous?.function?.name || '',
        arguments: args,
      },
    });
  }
  return [...byId.values()];
}

function isBetterToolCallArgs(nextArgs, currentArgs) {
  if (!currentArgs) return true;
  if (!nextArgs) return false;
  if (currentArgs === '{}' && nextArgs !== '{}') return true;
  return nextArgs.length >= currentArgs.length;
}

function normalizeUsage(usage) {
  if (!usage) return undefined;
  const prompt = usage.input_tokens || usage.prompt_tokens || 0;
  const completion = usage.output_tokens || usage.completion_tokens || 0;
  return { prompt_tokens: prompt, completion_tokens: completion, total_tokens: usage.total_tokens || prompt + completion };
}

function responseFromError(res, text) {
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { ok: false, status: res.status, statusText: res.statusText, data, rawText: text, error: data?.error?.message || text.slice(0, 240), headers: Object.fromEntries(res.headers.entries()) };
}

function trimTrailingSlash(url) {
  return String(url || '').endsWith('/') ? String(url).slice(0, -1) : String(url || '');
}
