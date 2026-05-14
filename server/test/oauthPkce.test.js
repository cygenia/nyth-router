import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPkceSession, deleteConnectedAccount, getConnectedAccessToken, importKiroRefreshToken, listConnectedAccounts, listPkceProviders, setDefaultConnectedAccount, submitCallbackUrl } from '../src/services/oauthPkce.js';

test('PKCE provider list exposes CLI localhost callback URLs', () => {
  const providers = listPkceProviders('https://nyth.example.com');
  const codex = providers.find((p) => p.id === 'codex');
  const anthropic = providers.find((p) => p.id === 'claude-oauth');
  const microsoft = providers.find((p) => p.id === 'codex-microsoft');
  const gemini = providers.find((p) => p.id === 'gemini-oauth');
  const kiro = providers.find((p) => p.id === 'kiro');
  assert.equal(codex.callbackUrl, 'http://localhost:1455/auth/callback');
  assert.equal(microsoft.callbackUrl, 'http://localhost:1455/auth/callback');
  assert.equal(microsoft.accountProviderId, 'codex');
  assert.equal(anthropic.callbackUrl, 'http://localhost:54545/callback');
  assert.equal(gemini.callbackUrl, 'http://127.0.0.1:8085/oauth2callback');
  assert.equal(kiro.mode, 'refresh-token-import');
});

test('PKCE session generates fresh one-time auth URL and challenge', () => {
  const a = createPkceSession('codex', 'https://nyth.example.com');
  const b = createPkceSession('codex', 'https://nyth.example.com');
  assert.notEqual(a.state, b.state);
  assert.notEqual(a.codeChallenge, b.codeChallenge);
  assert.ok(a.authUrl.includes('https://auth.openai.com/oauth/authorize'));
  assert.ok(a.authUrl.includes('code_challenge='));
  assert.ok(a.authUrl.includes('redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback'));
  assert.ok(!a.authUrl.includes('codex%2Fdevice'));
});

test('all implemented OAuth providers generate login links from public provider ids', () => {
  const cases = [
    ['codex', 'https://auth.openai.com/oauth/authorize', 'http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback', true],
    ['codex-microsoft', 'https://auth.openai.com/oauth/authorize', 'http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback', true],
    ['claude-oauth', 'https://claude.ai/oauth/authorize', 'http%3A%2F%2Flocalhost%3A54545%2Fcallback', true],
    ['gemini-oauth', 'https://accounts.google.com/o/oauth2/v2/auth', 'http%3A%2F%2F127.0.0.1%3A8085%2Foauth2callback', false],
  ];
  for (const [providerId, authBase, encodedRedirect, expectsPkce] of cases) {
    const session = createPkceSession(providerId);
    assert.equal(session.provider.id, providerId);
    assert.ok(session.authUrl.startsWith(authBase), providerId);
    assert.ok(session.authUrl.includes(`redirect_uri=${encodedRedirect}`), providerId);
    assert.equal(session.authUrl.includes('code_challenge='), expectsPkce, providerId);
    if (providerId === 'gemini-oauth') assert.equal(session.authUrl.includes('client_secret='), false, providerId);
  }
});

test('Codex Microsoft OAuth link forces the Auth0 Microsoft connection and stores as Codex account', () => {
  const session = createPkceSession('codex-microsoft');
  assert.equal(session.provider.id, 'codex-microsoft');
  assert.equal(session.provider.accountProviderId, 'codex');
  assert.ok(session.authUrl.includes('connection=windowslive'));
  assert.ok(session.authUrl.includes('prompt=login'));
  assert.ok(session.authUrl.includes('code_challenge='));
});

test('Gemini OAuth token exchange uses optional environment-provided CLI client secret server-side only', async () => {
  const { default: db } = await import('../src/db/connection.js');
  const originalFetch = globalThis.fetch;
  const session = createPkceSession('gemini-oauth');
  let posted;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('oauth2.googleapis.com/token')) {
      posted = new URLSearchParams(String(options.body));
      return new Response(JSON.stringify({ access_token: 'ya29.test', refresh_token: 'refresh.test', token_type: 'Bearer', expires_in: 3600, scope: 'openid email profile' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (String(url).includes('loadCodeAssist')) {
      return new Response(JSON.stringify({ cloudaicompanionProject: 'test-project', allowedTiers: [{ id: 'pro', isDefault: true, name: 'Google Pro' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ done: true, response: { cloudaicompanionProject: 'test-project' } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await submitCallbackUrl('gemini-oauth', `${session.callbackUrl}?code=test-code&state=${session.state}`);
    assert.equal(result.ok, true);
    assert.equal(posted.get('client_id'), '681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com');
    assert.equal(posted.has('client_secret'), false);
    assert.equal(posted.get('redirect_uri'), 'http://127.0.0.1:8085/oauth2callback');
    assert.equal(posted.has('code_verifier'), false);
    db.prepare('DELETE FROM oauth_provider_accounts WHERE id = ?').run(result.account.id);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Claude Code OAuth token exchange stays PKCE based and never posts a client secret', async () => {
  const originalFetch = globalThis.fetch;
  const session = createPkceSession('claude-oauth');
  let posted;
  globalThis.fetch = async (_url, options) => {
    posted = new URLSearchParams(String(options.body));
    return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'stubbed' }), { status: 400, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await submitCallbackUrl('claude-oauth', `${session.callbackUrl}?code=test-code&state=${session.state}`);
    assert.equal(result.ok, false);
    assert.equal(posted.get('client_id'), '9d1c250a-e61b-44d9-88ed-5944d1962f5e');
    assert.equal(posted.has('client_secret'), false);
    assert.equal(posted.has('code_verifier'), true);
    assert.equal(result.detail.error, 'invalid_grant');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('callback paste validates provider localhost redirect URL', async () => {
  const session = createPkceSession('codex');
  const wrong = await submitCallbackUrl('codex', `http://localhost:9999/auth/callback?code=x&state=${session.state}`);
  assert.equal(wrong.ok, false);
  assert.equal(wrong.error, 'callback_url_does_not_match_provider_redirect');
});


test('provider OAuth accounts allow multiple accounts per provider with default selection', async () => {
  const { default: db } = await import('../src/db/connection.js');
  const { encryptSecret, maskSecret } = await import('../src/lib/crypto.js');
  const now = Date.now();
  db.prepare(`
    INSERT INTO oauth_provider_accounts (
      id, provider_id, provider_name, account_label, account_email, token_type, scope,
      encrypted_access_token, encrypted_refresh_token, masked_access_token, is_default,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('oa_test_1', 'codex', 'OpenAI Codex', 'first@example.com', 'first@example.com', 'Bearer', 'openid', encryptSecret('token-one'), '', maskSecret('token-one'), 1, now, now);
  db.prepare(`
    INSERT INTO oauth_provider_accounts (
      id, provider_id, provider_name, account_label, account_email, token_type, scope,
      encrypted_access_token, encrypted_refresh_token, masked_access_token, is_default,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('oa_test_2', 'codex', 'OpenAI Codex', 'second@example.com', 'second@example.com', 'Bearer', 'openid', encryptSecret('token-two'), '', maskSecret('token-two'), 0, now, now);

  let accounts = listConnectedAccounts().filter((acct) => acct.providerId === 'codex');
  assert.equal(accounts.length, 2);
  assert.equal(accounts.filter((acct) => acct.isDefault).length, 1);
  assert.equal(await getConnectedAccessToken('codex'), 'token-one');
  assert.equal(await getConnectedAccessToken('codex', 'oa_test_2'), 'token-two');

  setDefaultConnectedAccount('codex', 'oa_test_2');
  accounts = listConnectedAccounts().filter((acct) => acct.providerId === 'codex');
  assert.equal(accounts.filter((acct) => acct.isDefault).length, 1);
  assert.equal(await getConnectedAccessToken('codex'), 'token-two');

  deleteConnectedAccount('codex', 'oa_test_2');
  assert.equal(await getConnectedAccessToken('codex'), 'token-one');
});

test('Kiro refresh token import stores an oauth account without exposing raw token', async () => {
  const { default: db } = await import('../src/db/connection.js');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(String(url).includes('prod.us-east-1.auth.desktop.kiro.dev/refreshToken'), true);
    return new Response(JSON.stringify({
      accessToken: 'header.' + Buffer.from(JSON.stringify({ email: 'kiro@example.com', sub: 'kiro-subject' })).toString('base64url') + '.sig',
      refreshToken: 'aorAAAAAG-new-refresh-token',
      profileArn: 'arn:aws:codewhisperer:us-east-1:123:profile/test',
      expiresIn: 3600,
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await importKiroRefreshToken('aorAAAAAG-refresh-token');
    assert.equal(result.ok, true);
    assert.equal(result.account.providerId, 'kiro');
    assert.equal(result.account.accountEmail, 'kiro@example.com');
    assert.equal(result.sourceType, 'secure-local-paste');
    assert.equal(result.account.refreshToken, undefined);
    assert.equal(JSON.stringify(result).includes('aorAAAAAG'), false);
    assert.equal(await getConnectedAccessToken('kiro', result.account.id), 'header.' + Buffer.from(JSON.stringify({ email: 'kiro@example.com', sub: 'kiro-subject' })).toString('base64url') + '.sig');
    db.prepare('DELETE FROM oauth_provider_accounts WHERE id = ?').run(result.account.id);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
