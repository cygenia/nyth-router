import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forwardChat } from '../src/adapters/codex.js';

test('codex adapter sends required store false and extracts item completed text', async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (_url, options) => {
    captured = JSON.parse(options.body);
    return new Response([
      'event: response.output_item.done\n',
      'data: {"type":"response.output_item.done","item":{"type":"message","status":"completed","content":[{"type":"output_text","text":"OK"}]}}\n\n',
      'event: response.completed\n',
      'data: {"type":"response.completed","response":{"id":"resp_test","status":"completed","output":[],"usage":{"input_tokens":1,"output_tokens":1,"total_tokens":2}}}\n\n',
    ].join(''), { status: 200 });
  };
  try {
    const result = await forwardChat({
      baseUrl: 'https://chatgpt.com/backend-api/codex',
      apiKey: 'token',
      credential: { accountSubject: 'acct' },
      body: { model: 'gpt-5.5', messages: [{ role: 'user', content: 'hi' }] },
    });
    assert.equal(captured.store, false);
    assert.equal(captured.stream, true);
    assert.equal(captured.input[0].type, 'message');
    assert.equal(captured.input[0].content[0].type, 'input_text');
    assert.equal(result.ok, true);
    assert.equal(result.data.choices[0].message.content, 'OK');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('codex adapter converts chat tools to responses tools and returns one OpenAI tool_call', async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (_url, options) => {
    captured = JSON.parse(options.body);
    return new Response([
      'event: response.output_item.added\n',
      'data: {"type":"response.output_item.added","item":{"type":"function_call","id":"fc_abc","call_id":"fc_abc","name":"get_weather","arguments":""}}\n\n',
      'event: response.output_item.done\n',
      'data: {"type":"response.output_item.done","item":{"type":"function_call","id":"fc_abc","call_id":"fc_abc","name":"get_weather","arguments":"{\\"city\\":\\"Jakarta\\"}"}}\n\n',
      'event: response.completed\n',
      'data: {"type":"response.completed","response":{"id":"resp_tool","status":"completed","output":[],"usage":{"input_tokens":9,"output_tokens":3,"total_tokens":12}}}\n\n',
    ].join(''), { status: 200 });
  };
  try {
    const result = await forwardChat({
      baseUrl: 'https://chatgpt.com/backend-api/codex',
      apiKey: 'token',
      body: {
        model: 'gpt-5.5',
        messages: [{ role: 'user', content: 'weather?' }],
        tools: [{
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get weather',
            parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
          },
        }],
      },
    });
    assert.equal(captured.tools[0].type, 'function');
    assert.equal(captured.tools[0].name, 'get_weather');
    assert.equal(captured.tools[0].parameters.type, 'object');
    assert.equal(result.data.choices[0].finish_reason, 'tool_calls');
    assert.equal(result.data.choices[0].message.content, null);
    assert.deepEqual(result.data.choices[0].message.tool_calls, [{
      id: 'call_abc',
      type: 'function',
      function: { name: 'get_weather', arguments: '{"city":"Jakarta"}' },
    }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('codex adapter converts prior assistant tool calls and tool outputs into responses input', async () => {
  const originalFetch = globalThis.fetch;
  let captured;
  globalThis.fetch = async (_url, options) => {
    captured = JSON.parse(options.body);
    return new Response([
      'event: response.completed\n',
      'data: {"type":"response.completed","response":{"id":"resp_final","status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"Weather is clear."}]}]}}\n\n',
    ].join(''), { status: 200 });
  };
  try {
    const result = await forwardChat({
      baseUrl: 'https://chatgpt.com/backend-api/codex',
      apiKey: 'token',
      body: {
        model: 'gpt-5.5',
        messages: [
          { role: 'user', content: 'weather?' },
          { role: 'assistant', content: null, tool_calls: [{ id: 'call_abc', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Jakarta"}' } }] },
          { role: 'tool', tool_call_id: 'call_abc', content: '{"temp":30,"condition":"clear"}' },
        ],
      },
    });
    assert.equal(captured.input[1].type, 'function_call');
    assert.equal(captured.input[1].id, 'fc_abc');
    assert.equal(captured.input[1].call_id, 'fc_abc');
    assert.equal(captured.input[2].type, 'function_call_output');
    assert.equal(captured.input[2].call_id, 'fc_abc');
    assert.equal(result.data.choices[0].message.content, 'Weather is clear.');
    assert.equal(result.data.choices[0].finish_reason, 'stop');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
