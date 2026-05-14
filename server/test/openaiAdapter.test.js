import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forwardChat } from '../src/adapters/openai.js';

test('openai adapter carries stream keepalive seconds for successful streams', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('data: [DONE]\n\n', {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });

  try {
    const result = await forwardChat({
      baseUrl: 'https://example.test/v1',
      apiKey: 'test-key',
      body: { model: 'x', stream: true, messages: [] },
      settings: { streamKeepaliveSeconds: '15', streamBootstrapRetries: '2' },
    });

    assert.equal(result.ok, true);
    assert.equal(result.streamKeepaliveSeconds, 15);
    assert.ok(result.stream);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('openai adapter retries stream bootstrap when response body is missing', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return { ok: true, status: 200, statusText: 'OK', body: null, headers: new Headers() };
    }
    return new Response('data: [DONE]\n\n', {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  };

  try {
    const result = await forwardChat({
      baseUrl: 'https://example.test/v1',
      body: { model: 'x', stream: true, messages: [] },
      settings: { streamBootstrapRetries: '1' },
    });

    assert.equal(calls, 2);
    assert.equal(result.ok, true);
    assert.ok(result.stream);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
