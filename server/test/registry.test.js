import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRegistry, totalProviderCount, totalModelCount, getProviderById } from '../src/registry/providers.js';

test('registry has at least 100 providers', () => {
  assert.ok(totalProviderCount() >= 100, `expected >=100 providers, got ${totalProviderCount()}`);
});

test('registry has at least 175 models total', () => {
  assert.ok(totalModelCount() >= 175, `expected >=175 models, got ${totalModelCount()}`);
});

test('registry contains the canonical implemented providers', () => {
  for (const id of ['openai', 'anthropic', 'google', 'mistral', 'groq', 'deepseek', 'ollama']) {
    const p = getProviderById(id);
    assert.ok(p, `missing provider ${id}`);
    assert.ok(typeof p.name === 'string' && p.name.length > 0);
    assert.ok(['openai-compatible', 'anthropic-compatible', 'native', 'local'].includes(p.format));
    assert.ok(Array.isArray(p.capabilities));
    assert.ok(Array.isArray(p.models));
  }
});

test('every provider has well-formed metadata', () => {
  const reg = getRegistry();
  const ids = new Set();
  for (const p of reg) {
    assert.match(p.id, /^[a-z0-9-]+$/, `bad id ${p.id}`);
    assert.ok(!ids.has(p.id), `duplicate id ${p.id}`);
    ids.add(p.id);
    assert.ok(p.baseUrl, `missing baseUrl for ${p.id}`);
    assert.ok(['implemented', 'metadata-only', 'planned'].includes(p.status));
  }
});
