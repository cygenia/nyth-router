import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncRegistry } from '../src/services/registrySync.js';
import { estimateCost, getModelPricing, compareAcrossModels } from '../src/services/costCalculator.js';

syncRegistry();

test('getModelPricing returns null for unknown models', () => {
  assert.equal(getModelPricing('nonexistent-provider', 'nonexistent-model'), null);
});

test('estimateCost returns null when pricing unknown', () => {
  const c = estimateCost({ providerId: 'nonexistent', model: 'nope', inputTokens: 1000, outputTokens: 1000 });
  assert.equal(c, null);
});

test('estimateCost computes input + output cost using $/1K rates', () => {
  // OpenAI gpt-5.5: in 4 / out 12 per 1K tokens.
  const c = estimateCost({ providerId: 'openai', model: 'gpt-5.5', inputTokens: 1000, outputTokens: 500 });
  assert.equal(typeof c, 'number');
  assert.ok(c > 0);
  // 1K * 4 / 1000 + 500 * 12 / 1000 = 4 + 6 = 10
  assert.ok(Math.abs(c - 10) < 0.001, `got ${c}`);
});

test('compareAcrossModels orders cheapest first', () => {
  const ranked = compareAcrossModels({ inputTokens: 1000, outputTokens: 1000 });
  assert.ok(ranked.length > 5);
  for (let i = 1; i < ranked.length; i += 1) {
    assert.ok(ranked[i - 1].estimatedCost <= ranked[i].estimatedCost);
  }
});
