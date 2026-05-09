import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateTokens, estimateMessages, preview } from '../src/services/tokenizer.js';

test('estimateTokens handles empty inputs', () => {
  assert.equal(estimateTokens(null), 0);
  assert.equal(estimateTokens(''), 0);
});

test('estimateTokens grows with input length', () => {
  const a = estimateTokens('hi');
  const b = estimateTokens('hello world from bigliner');
  const c = estimateTokens('a'.repeat(400));
  assert.ok(a > 0);
  assert.ok(b > a);
  assert.ok(c >= 100);
});

test('estimateMessages adds per-message overhead', () => {
  const single = estimateMessages([{ role: 'user', content: 'hello' }]);
  const triple = estimateMessages([
    { role: 'system', content: 'hi' },
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'hi' },
  ]);
  assert.ok(triple > single);
});

test('preview truncates and normalises whitespace', () => {
  assert.equal(preview('hello   world\nfoo'), 'hello world foo');
  const long = 'x'.repeat(500);
  const out = preview(long, 64);
  assert.ok(out.length <= 64);
  assert.ok(out.endsWith('…'));
});
