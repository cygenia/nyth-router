import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import v1Router from '../src/routes/v1.js';
import db from '../src/db/connection.js';
import { createUnifiedKey } from '../src/services/auth.js';
import { syncRegistry } from '../src/services/registrySync.js';
import { ensureDefaultRoutes } from '../src/services/routeEngine.js';

syncRegistry();
ensureDefaultRoutes();

function fakeRes() {
  const headers = {};
  const chunks = [];
  const listeners = new Map();
  return {
    statusCode: 200,
    headers,
    chunks,
    ended: false,
    writableEnded: false,
    status(code) { this.statusCode = code; return this; },
    setHeader(k, v) { headers[k.toLowerCase()] = v; return this; },
    getHeader(k) { return headers[k.toLowerCase()]; },
    flushHeaders() {},
    on(event, handler) { listeners.set(event, handler); return this; },
    json(payload) { this.jsonPayload = payload; this.ended = true; this.writableEnded = true; listeners.get('finish')?.(); return this; },
    write(chunk) { chunks.push(String(chunk)); return true; },
    end(chunk = '') { if (chunk) chunks.push(String(chunk)); this.ended = true; this.writableEnded = true; listeners.get('finish')?.(); return this; },
  };
}

function findRoute(method, path) {
  return v1Router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method])?.route?.stack[0]?.handle;
}

test('/v1/models exposes slash canonical ids and hides colon aliases', async () => {
  const handler = findRoute('get', '/models');
  const res = fakeRes();
  await handler({}, res);
  const codex = res.jsonPayload.data.find((m) => m.id === 'codex/gpt-5.5');
  const claude = res.jsonPayload.data.find((m) => m.id === 'claude-oauth/claude-opus-4.7');
  const gemini = res.jsonPayload.data.find((m) => m.id === 'gemini-oauth/gemini-3.0-pro');
  assert.ok(codex);
  assert.ok(claude);
  assert.ok(gemini);
  assert.equal(codex.nyth.canonical, 'codex/gpt-5.5');
  assert.equal(claude.nyth.canonical, 'claude-oauth/claude-opus-4.7');
  assert.equal(gemini.nyth.canonical, 'gemini-oauth/gemini-3.0-pro');
  assert.ok(codex.nyth.aliases.includes('openai-codex/gpt-5.5'));
  assert.ok(claude.nyth.aliases.includes('anthropic-oauth/claude-opus-4.7'));
  assert.ok(gemini.nyth.aliases.includes('google-oauth/gemini-3.0-pro'));
  assert.equal(res.jsonPayload.data.flatMap((m) => m.nyth.aliases).some((a) => a.includes(':')), false);
});

test('streaming chat completions returns OpenAI SSE chunks for agent clients', async () => {
 const originalFetch = globalThis. fetch;
 globalThis. fetch = async (_url, options = {}) => {
 const request = JSON. parse(options. body || '{}');
 if (request. stream) {
 return new Response([
 'data: {"id":"chatcmpl_test", "object":"chat.completion.chunk", "created":1, "model":"gpt-5.5", "choices":[{"index":0, "delta":{"role":"assistant"}, "finish_reason":null}]}\n\n',
 'data: {"id":"chatcmpl_test", "object":"chat.completion.chunk", "created":1, "model":"gpt-5.5", "choices":[{"index":0, "delta":{"content":"hello streamed"}, "finish_reason":null}]}\n\n',
 'data: {"id":"chatcmpl_test", "object":"chat.completion.chunk", "created":1, "model":"gpt-5.5", "choices":[{"index":0, "delta":{}, "finish_reason":"stop"}]}\n\n',
 'data: [DONE]\n\n',
 ]. join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } });
 }
 return new Response([
 '{"id":"chatcmpl_test", "object":"chat. completion", "created":1, "model":"gpt-5.5", "choices":[{"index":0, "message":{"role":"assistant", "content":"hello streamed"}, "finish_reason":"stop"}], "usage":{"prompt_tokens":2, "completion_tokens":3, "total_tokens":5}}',
 ]. join(''), { status: 200, headers: { 'content-type': 'application/json' } });
 };
  try {
    const key = createUnifiedKey({ label: 'SSE test key' });
    const handler = findRoute('post', '/chat/completions');
    const req = {
      headers: { authorization: `Bearer ${key.key}` },
      body: { model: 'openai/gpt-5-mini', stream: true, messages: [{ role: 'user', content: 'hi' }] },
    };
    const res = fakeRes();
    await handler(req, res);
    const text = res.chunks.join('');
    assert.equal(res.statusCode, 200);
    assert.equal(res.getHeader('content-type'), 'text/event-stream; charset=utf-8');
    assert.match(text, /chat\.completion\.chunk/);
    assert.match(text, /hello streamed/);
 assert. match(text, /data: \[DONE\]/);
 } finally {
 globalThis. fetch = originalFetch;
 }
});

test('non-streaming chat completions can emit keepalive blank lines before JSON', async () => {
  const now = Date.now();
  db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).run('nonStreamKeepaliveSeconds', '1', now);
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  globalThis.setInterval = (fn) => { fn(); return 1; };
  globalThis.clearInterval = () => {};
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response([
    '{"id":"chatcmpl_keepalive", "object":"chat.completion", "created":1, "model":"gpt-5.5", "choices":[{"index":0, "message":{"role":"assistant", "content":"hello keepalive"}, "finish_reason":"stop"}], "usage":{"prompt_tokens":2, "completion_tokens":3, "total_tokens":5}}',
  ].join(''), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    const key = createUnifiedKey({ label: 'Non-stream keepalive test key' });
    const handler = findRoute('post', '/chat/completions');
    const req = {
      headers: { authorization: `Bearer ${key.key}` },
      body: { model: 'openai/gpt-5-mini', stream: false, messages: [{ role: 'user', content: 'hi' }] },
    };
    const res = fakeRes();
    await handler(req, res);
    const text = res.chunks.join('');
    assert.equal(res.statusCode, 200);
    assert.equal(res.getHeader('content-type'), 'application/json; charset=utf-8');
    assert.ok(text.startsWith('\n'));
    assert.match(text, /hello keepalive/);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
    db.prepare('DELETE FROM settings WHERE key = ?').run('nonStreamKeepaliveSeconds');
  }
});

test('non-streaming chat completions returns OpenAI JSON response', async () => {
  db.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).run('nonStreamKeepaliveSeconds', '0', Date.now());
 const originalFetch = globalThis. fetch;
 globalThis. fetch = async (_url, options = {}) => {
 const request = JSON. parse(options. body || '{}');
 assert. equal(request. stream, false);
 return new Response([
 '{"id":"chatcmpl_nonstream", "object":"chat. completion", "created":1, "model":"gpt-5.5", "choices":[{"index":0, "message":{"role":"assistant", "content":"hello non-stream"}, "finish_reason":"stop"}], "usage":{"prompt_tokens":2, "completion_tokens":3, "total_tokens":5}}',
 ]. join(''), { status: 200, headers: { 'content-type': 'application/json' } });
 };
 try {
 const key = createUnifiedKey({ label: 'JSON test key' });
 const handler = findRoute('post', '/chat/completions');
 const req = {
 headers: { authorization: `Bearer ${key. key}` },
 body: { model: 'openai/gpt-5-mini', stream: false, messages: [{ role: 'user', content: 'hi' }] },
 };
 const res = fakeRes();
 await handler(req, res);
 assert. equal(res. statusCode, 200);
 assert. equal(res. getHeader('content-type'), undefined);
 assert. equal(res. jsonPayload. object, 'chat. completion');
 assert. equal(res. jsonPayload. choices[0]. message. content, 'hello non-stream');
 } finally {
 globalThis. fetch = originalFetch;
 db.prepare('DELETE FROM settings WHERE key = ?').run('nonStreamKeepaliveSeconds');
 }
});
