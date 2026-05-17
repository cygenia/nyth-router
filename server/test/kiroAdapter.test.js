import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forwardChat } from '../src/adapters/kiro.js';

test('kiro adapter drops prior tool-call history and sends clean current message', async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (_url, options) => {
    captured = JSON.parse(options.body);
    return new Response(new Uint8Array([]), { status: 200 });
  };
  try {
    await forwardChat({
      apiKey: 'token',
      credential: { accessToken: 'token', metadata: {} },
      body: {
        model: 'claude-opus-4.7',
        messages: [
          { role: 'system', content: 'system prompt' },
          { role: 'user', content: 'list files' },
          { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'terminal', arguments: '{"command":"ls"}' } }] },
          { role: 'tool', tool_call_id: 'call_1', content: 'file-a\nfile-b' },
          { role: 'user', content: 'now say ok only' },
        ],
        tools: [{ type: 'function', function: { name: 'terminal', parameters: { type: 'object', properties: { command: { type: 'string' } } } } }],
      },
    });

    const state = captured.conversationState;
    assert.equal(state.currentMessage.userInputMessage.content.includes('now say ok only'), true);
    assert.equal(JSON.stringify(state.history).includes('toolUses'), false);
    assert.equal(JSON.stringify(state.history).includes('toolResults'), false);
    assert.equal(state.history.some((item) => item.assistantResponseMessage), false);
    assert.equal(JSON.stringify(state.currentMessage).includes('toolSpecification'), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
