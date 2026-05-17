import crypto from 'node:crypto';
import { listKiroModels } from '../services/kiroAuth.js';

const KIRO_GENERATE_URL = 'https://codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse';

export async function listModels({ apiKey, credential, signal }) {
  const accessToken = credential?.accessToken || apiKey;
  const profileArn = credential?.metadata?.profileArn || null;
  return listKiroModels({ accessToken, profileArn, signal });
}

export async function ping({ apiKey, credential, signal }) {
  const result = await listModels({ apiKey, credential, signal });
  return { ok: result.ok, status: result.status, error: result.ok ? undefined : result.error };
}

export async function forwardChat({ apiKey, credential, body, signal }) {
  const accessToken = credential?.accessToken || apiKey;
  if (!accessToken) {
    return openAiError(401, 'missing_kiro_access_token');
  }
  const model = String(body?.model || '').trim();
  const payload = buildKiroPayload(model, body || {}, credential || {});
  const headers = {
    'content-type': 'application/json',
    accept: 'application/vnd.amazon.eventstream',
    authorization: `Bearer ${accessToken}`,
    'x-amz-target': 'AmazonCodeWhispererStreamingService.GenerateAssistantResponse',
    'user-agent': 'AWS-SDK-JS/3.0.0 kiro-ide/1.0.0',
    'x-amz-user-agent': 'aws-sdk-js/3.0.0 kiro-ide/1.0.0',
    'amz-sdk-request': 'attempt=1; max=3',
    'amz-sdk-invocation-id': crypto.randomUUID(),
  };

  const res = await fetch(KIRO_GENERATE_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal,
  });
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!res.ok) {
    const text = decodeUtf8(bytes);
    return {
      ok: false,
      status: res.status,
      statusText: res.statusText,
      data: { error: { message: sanitizeError(text) || `kiro_http_${res.status}`, type: 'kiro_error' } },
      rawText: text,
      headers: Object.fromEntries(res.headers.entries()),
    };
  }

  const parsed = parseKiroEventStream(bytes);
  const content = parsed.content.join('');
  const toolCalls = parsed.toolCalls;
  const message = { role: 'assistant', content };
  if (toolCalls.length) message.tool_calls = toolCalls;
  const completion = {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, message, finish_reason: toolCalls.length ? 'tool_calls' : 'stop' }],
    usage: {
      prompt_tokens: estimatePromptTokens(body?.messages || []),
      completion_tokens: Math.ceil(content.length / 4),
      total_tokens: estimatePromptTokens(body?.messages || []) + Math.ceil(content.length / 4),
    },
  };
  return { ok: true, status: 200, statusText: 'OK', data: completion, rawText: JSON.stringify(completion), headers: Object.fromEntries(res.headers.entries()) };
}

function buildKiroPayload(model, body, credential) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const tools = Array.isArray(body.tools) ? body.tools : [];
  const { history, currentMessage } = convertMessages(messages, tools, model);
  const profileArn = credential?.metadata?.profileArn || '';
  const finalContent = `[Context: Current time is ${new Date().toISOString()}]\n\n${currentMessage?.userInputMessage?.content || ''}`;
  const payload = {
    conversationState: {
      chatTriggerType: 'MANUAL',
      conversationId: crypto.randomUUID(),
      currentMessage: {
        userInputMessage: {
          ...(currentMessage?.userInputMessage || {}),
          content: finalContent || 'continue',
          modelId: model,
          origin: 'AI_EDITOR',
        },
      },
      history,
    },
  };
  if (profileArn) payload.profileArn = profileArn;
  const maxTokens = body.max_tokens ?? body.max_completion_tokens;
  if (maxTokens || body.temperature !== undefined || body.top_p !== undefined) {
    payload.inferenceConfig = {};
    if (maxTokens) payload.inferenceConfig.maxTokens = maxTokens;
    if (body.temperature !== undefined) payload.inferenceConfig.temperature = body.temperature;
    if (body.top_p !== undefined) payload.inferenceConfig.topP = body.top_p;
  }
  return payload;
}

function convertMessages(messages, tools, model) {
  const history = [];
  const supportsImages = model.toLowerCase().includes('claude');
  let pendingRole = null;
  let pendingText = [];
  let pendingToolResults = [];
  let pendingImages = [];

  const flush = () => {
    if (!pendingRole) return;
    if (pendingRole === 'assistant') {
      history.push({ assistantResponseMessage: { content: pendingText.join('\n\n').trim() || '...' } });
    } else {
      const userInputMessage = { content: pendingText.join('\n\n').trim() || 'continue', modelId: model };
      if (pendingImages.length) userInputMessage.images = pendingImages;
      if (pendingToolResults.length) userInputMessage.userInputMessageContext = { toolResults: pendingToolResults };
      if (tools.length && history.length === 0) {
        userInputMessage.userInputMessageContext = userInputMessage.userInputMessageContext || {};
        userInputMessage.userInputMessageContext.tools = tools.map(normalizeTool).filter(Boolean);
      }
      history.push({ userInputMessage });
    }
    pendingText = [];
    pendingToolResults = [];
    pendingImages = [];
  };

  for (const msg of messages) {
    // Kiro's GenerateAssistantResponse endpoint is stricter than OpenAI/Anthropic
    // chat APIs. Prior assistant tool_calls plus tool result messages frequently
    // make CodeWhisperer return `Improperly formed request`. Keep the stable
    // path for agent/coding sessions: send user/system transcript only, and put
    // tool definitions on the current user message below.
    if (msg.role === 'tool' || msg.role === 'assistant') {
      if (pendingRole) flush();
      pendingRole = null;
      continue;
    }

    let role = msg.role;
    if (role === 'system') role = 'user';
    if (role !== pendingRole && pendingRole) flush();
    pendingRole = role;

    const { text, images } = extractUserContent(msg.content, supportsImages);
    if (text) pendingText.push(text);
    pendingImages.push(...images);
  }
  if (pendingRole) flush();

  let currentMessage = null;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].userInputMessage) {
      currentMessage = history.splice(i, 1)[0];
      break;
    }
  }
  if (!currentMessage) currentMessage = { userInputMessage: { content: 'continue', modelId: model } };

  const firstTools = history[0]?.userInputMessage?.userInputMessageContext?.tools;
  for (const item of history) {
    if (item.userInputMessage?.userInputMessageContext?.tools) delete item.userInputMessage.userInputMessageContext.tools;
    if (item.userInputMessage?.userInputMessageContext && !Object.keys(item.userInputMessage.userInputMessageContext).length) delete item.userInputMessage.userInputMessageContext;
    if (item.userInputMessage && !item.userInputMessage.modelId) item.userInputMessage.modelId = model;
  }
  if (firstTools && currentMessage.userInputMessage) {
    currentMessage.userInputMessage.userInputMessageContext = currentMessage.userInputMessage.userInputMessageContext || {};
    currentMessage.userInputMessage.userInputMessageContext.tools = firstTools;
  }
  return { history, currentMessage };
}

function normalizeTool(tool) {
  const name = tool.function?.name || tool.name;
  if (!name) return null;
  const schema = tool.function?.parameters || tool.parameters || tool.input_schema || {};
  return {
    toolSpecification: {
      name,
      description: tool.function?.description || tool.description || `Tool: ${name}`,
      inputSchema: { json: Object.keys(schema).length ? { ...schema, required: schema.required || [] } : { type: 'object', properties: {}, required: [] } },
    },
  };
}

function extractUserContent(content, supportsImages) {
  if (typeof content === 'string') return { text: content, images: [] };
  if (!Array.isArray(content)) return { text: '', images: [] };
  const text = [];
  const images = [];
  for (const part of content) {
    if (part.type === 'text' || part.text) text.push(part.text || '');
    else if (supportsImages && part.type === 'image_url') {
      const url = part.image_url?.url || '';
      const match = url.match(/^data:([^;]+);base64,(.+)$/);
      if (match) images.push({ format: match[1].split('/')[1] || match[1], source: { bytes: match[2] } });
      else if (url) text.push(`[Image: ${url}]`);
    }
  }
  return { text: text.join('\n'), images };
}

function parseKiroEventStream(bytes) {
  let offset = 0;
  const content = [];
  const toolCalls = [];
  while (offset + 16 <= bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
    const totalLength = view.getUint32(0, false);
    const headersLength = view.getUint32(4, false);
    if (!totalLength || totalLength < 16 || offset + totalLength > bytes.length) break;
    const headersStart = offset + 12;
    const payloadStart = headersStart + headersLength;
    const payloadEnd = offset + totalLength - 4;
    const headers = parseHeaders(bytes.slice(headersStart, payloadStart));
    const payloadText = decodeUtf8(bytes.slice(payloadStart, payloadEnd));
    const payload = safeJson(payloadText, null);
    const eventType = headers[':event-type'] || '';
    if ((eventType === 'assistantResponseEvent' || eventType === 'codeEvent') && payload?.content) content.push(payload.content);
    if (eventType === 'toolUseEvent' && payload) {
      const items = Array.isArray(payload) ? payload : [payload];
      for (const item of items) {
        toolCalls.push({
          id: item.toolUseId || `call_${Date.now()}`,
          type: 'function',
          function: { name: item.name || 'tool', arguments: typeof item.input === 'string' ? item.input : JSON.stringify(item.input || {}) },
        });
      }
    }
    offset += totalLength;
  }
  return { content, toolCalls };
}

function parseHeaders(bytes) {
  const headers = {};
  let offset = 0;
  while (offset < bytes.length) {
    const nameLen = bytes[offset++];
    const name = decodeUtf8(bytes.slice(offset, offset + nameLen));
    offset += nameLen;
    const type = bytes[offset++];
    if (type === 7) {
      const len = new DataView(bytes.buffer, bytes.byteOffset + offset).getUint16(0, false);
      offset += 2;
      headers[name] = decodeUtf8(bytes.slice(offset, offset + len));
      offset += len;
    } else if (type === 6) {
      headers[name] = new DataView(bytes.buffer, bytes.byteOffset + offset).getInt32(0, false);
      offset += 4;
    } else {
      break;
    }
  }
  return headers;
}

function stringifyContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((item) => item.text || item.content || '').join('\n');
  return content == null ? '' : JSON.stringify(content);
}

function safeJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function decodeUtf8(bytes) {
  return new TextDecoder().decode(bytes || new Uint8Array());
}

function estimatePromptTokens(messages) {
  return Math.ceil(JSON.stringify(messages || []).length / 4);
}

function sanitizeError(text) {
  return String(text || '').replace(/aorAAAAAG[\w.-]+/g, '[redacted]').slice(0, 500);
}

function openAiError(status, message) {
  return { ok: false, status, statusText: 'Error', data: { error: { message, type: 'kiro_error' } }, rawText: message, headers: {} };
}
