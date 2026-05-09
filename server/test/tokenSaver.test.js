import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compressText, optimizeMessages } from '../src/services/tokenSaver.js';

test('compressText reduces verbose prose and reports savings', () => {
  const result = compressText('This is basically just a really verbose sentence that could definitely be compressed quite a bit.', { mode: 'safe' });
  assert.ok(result.text.length < result.originalChars);
  assert.ok(result.beforeTokens >= result.afterTokens);
});

test('optimizeMessages compresses tool outputs when enabled', () => {
  const before = 'This is basically just a really verbose command output that could definitely be compressed quite a bit.\n'.repeat(20);
  const { messages, savings } = optimizeMessages([
    { role: 'user', content: 'summarize' },
    { role: 'tool', content: before },
  ], { tokenSaverEnabled: 'true', tokenSaverMode: 'safe', compressToolOutput: 'true' });
  assert.ok(savings);
  assert.equal(savings.compressedMessages, 1);
  assert.ok(messages[1].content.length < before.length);
});
