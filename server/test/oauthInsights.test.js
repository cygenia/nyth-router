import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import db from '../src/db/connection.js';
import { encryptSecret } from '../src/lib/crypto.js';
import { listProviderAccountsWithInsights, refreshAllProviderAccountInsights, testAllProviderAccounts, testProviderAccount } from '../src/services/oauthInsights.js';
import { getAdapter } from '../src/adapters/index.js';

function addAccount(providerId = 'gemini') {
  const now = Date.now();
  db.prepare('DELETE FROM oauth_provider_accounts WHERE id = ?').run(`acct_${providerId}`);
  db.prepare(`
    INSERT INTO oauth_provider_accounts (
      id, provider_id, provider_name, account_label, token_type, scope,
      encrypted_access_token, encrypted_refresh_token, masked_access_token, is_default,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(`acct_${providerId}`, providerId, providerId, 'test account', 'Bearer', 'openid email profile cloud-platform', encryptSecret('token.test'), '', 'tok...test', 1, now, now);
  return `acct_${providerId}`;
}

test('Gemini OAuth health uses userinfo/CLI-safe adapter, not Generative Language /models scope probe', async () => {
  const accountId = addAccount('gemini');
  const originalFetch = globalThis.fetch;
  let calledUrl = '';
  globalThis.fetch = async (url) => {
    calledUrl = String(url);
    return new Response(JSON.stringify({ sub: '123', email: 'g@example.com' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await testProviderAccount('gemini', accountId);
    assert.equal(result.ok, true);
    assert.equal(calledUrl, 'https://openidconnect.googleapis.com/v1/userinfo');
    assert.ok(Array.isArray(result.quotaWindows));
    assert.ok(result.quotaWindows.some((q) => q.label === 'Daily observed'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('OAuth account insights include quota windows for all OAuth providers', () => {
  addAccount('codex');
  addAccount('anthropic');
  const accounts = listProviderAccountsWithInsights();
  for (const providerId of ['codex', 'anthropic', 'gemini']) {
    const acct = accounts.find((a) => a.providerId === providerId);
    assert.ok(acct, providerId);
    assert.ok(Array.isArray(acct.quotaWindows), providerId);
    assert.ok(acct.quotaWindows.length >= 1, providerId);
    assert.equal(typeof acct.quotaWindows[0].percent, 'number');
    assert.ok(acct.quotaWindows[0].resetAt);
    assert.notEqual(acct.statusDetail.status, 'unknown');
  }
});

test('Kiro OAuth health extracts email from refreshed JWT identity claims', async () => {
  const accountId = addAccount('kiro');
  const email = 'kiro@example.com';
  const jwt = 'header.' + Buffer.from(JSON.stringify({ email, sub: 'kiro-subject' })).toString('base64url') + '.sig';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    const result = await testProviderAccount('kiro', accountId);
    assert.equal(result.ok, true);
    db.prepare('UPDATE oauth_provider_accounts SET encrypted_access_token = ? WHERE id = ?').run(encryptSecret(jwt), accountId);
    const result2 = await testProviderAccount('kiro', accountId);
    assert.equal(result2.accountEmail, email);
    const row = db.prepare('SELECT account_email AS email, account_label AS label FROM oauth_provider_accounts WHERE id = ?').get(accountId);
    assert.equal(row.email, email);
    assert.equal(row.label, email);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test('Codex OAuth refresh persists account email and plan when provider exposes userinfo', async () => {
  const accountId = addAccount('codex');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/oauth/userinfo')) {
      return new Response(JSON.stringify({ email: 'codex@example.com', name: 'Codex User', plan: 'Plus' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await testProviderAccount('codex', accountId);
    assert.equal(result.ok, true);
    const row = db.prepare('SELECT account_email AS email, account_label AS label, plan_name AS planName FROM oauth_provider_accounts WHERE id = ?').get(accountId);
    assert.equal(row.email, 'codex@example.com');
    assert.equal(row.label, 'codex@example.com');
    assert.equal(row.planName, 'Plus');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('refreshAllProviderAccountInsights refreshes all stored provider accounts', async () => {
  addAccount('codex');
  addAccount('gemini');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/oauth/userinfo')) {
      return new Response(JSON.stringify({ email: 'codex@example.com' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: true, sub: '123', email: 'g@example.com' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const summary = await refreshAllProviderAccountInsights();
    assert.ok(summary.results.length >= 2);
    assert.ok(summary.total >= 2);
    assert.equal(summary.failed, 0);
    assert.ok(summary.results.some((item) => item.providerId === 'codex'));
    assert.ok(summary.results.some((item) => item.providerId === 'gemini'));
    const testAll = await testAllProviderAccounts();
    assert.ok(testAll.results.length >= 2);
    assert.equal(testAll.total, testAll.results.length);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Gemini OAuth adapter maps OpenAI chat requests to Code Assist endpoint', async () => {
  const adapter = getAdapter('gemini-oauth-account');
  const originalFetch = globalThis.fetch;
  let calledUrl = '';
  let posted;
  globalThis.fetch = async (url, options) => {
    calledUrl = String(url);
    posted = JSON.parse(String(options.body));
    return new Response(JSON.stringify({ response: { candidates: [{ content: { parts: [{ text: 'pong' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await adapter.forwardChat({ apiKey: 'ya29.test', body: { model: 'gemini-3.0-pro', messages: [{ role: 'user', content: 'ping' }] } });
    assert.equal(calledUrl, 'https://cloudcode-pa.googleapis.com/v1internal:generateContent');
    assert.equal(posted.request.contents[0].role, 'user');
    assert.equal(result.ok, true);
    assert.equal(result.data.choices[0].message.content, 'pong');
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test('Gemini OAuth adapter includes discovered Code Assist project and native CLI headers', async () => {
  const adapter = getAdapter('gemini-oauth-account');
  const originalFetch = globalThis.fetch;
  let posted;
  let headers;
  globalThis.fetch = async (_url, options) => {
    posted = JSON.parse(String(options.body));
    headers = options.headers;
    return new Response(JSON.stringify({ response: { candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await adapter.forwardChat({ apiKey: 'ya29.test', credential: { googleProject: 'test-project-123' }, body: { model: 'gemini-3.0-pro', messages: [{ role: 'user', content: 'ping' }] } });
    assert.equal(result.ok, true);
    assert.equal(posted.project, 'test-project-123');
    assert.equal(headers['x-goog-api-client'], 'google-genai-sdk/1.41.0 gl-node/v22.19.0');
    assert.match(headers['user-agent'], /^GeminiCLI\//);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Gemini OAuth model listing normalizes Code Assist model payloads', async () => {
  const adapter = getAdapter('gemini-oauth-account');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ models: [{ name: 'models/gemini-3.0-pro' }, { id: 'gemini-3.0-flash' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    const result = await adapter.listModels({ apiKey: 'ya29.test' });
    assert.equal(result.ok, true);
    assert.deepEqual(result.data.models, ['gemini-3.0-pro', 'gemini-3.0-flash']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
