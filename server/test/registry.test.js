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

test('OpenAI registry includes Codex coding models', () => {
  const openai = getProviderById('openai');
  const ids = new Set(openai.models.map((m) => m.id));
  assert.ok(ids.has('gpt-5-codex'));
  assert.ok(ids.has('codex-1'));
});

test('OAuth providers mirror normal provider model menus', () => {
  const codex = getProviderById('codex');
  const claude = getProviderById('claude-oauth');
  const gemini = getProviderById('gemini-oauth');
  assert.ok(codex.models.some((m) => m.id === 'gpt-5.5'));
  assert.ok(claude.models.some((m) => m.id === 'claude-opus-4.7'));
  assert.ok(gemini.models.some((m) => m.id === 'gemini-3.0-pro'));
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
    assert.ok(['openai-compatible', 'anthropic-compatible', 'codex-account', 'gemini-oauth-account', 'kiro-account', 'native', 'local'].includes(p.format), `bad format for ${p.id}`);
  }
});
