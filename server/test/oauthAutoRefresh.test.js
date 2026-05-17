import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importKiroRefreshToken, refreshExpiringAccounts } from '../src/services/oauthPkce.js';

test('OAuth auto-refresh proactively refreshes Kiro accounts before expiry window', async () => {
  const { default: db } = await import('../src/db/connection.js');
  const originalFetch = globalThis.fetch;
  let refreshCalls = 0;
  globalThis.fetch = async (url) => {
    assert.equal(String(url).includes('prod.us-east-1.auth.desktop.kiro.dev/refreshToken'), true);
    refreshCalls += 1;
    return new Response(JSON.stringify({
      accessToken: 'header.' + Buffer.from(JSON.stringify({ email: 'autorefresh@example.com', sub: 'kiro-auto' })).toString('base64url') + '.sig',
      refreshToken: 'aorAAAAAG-auto-refresh-new',
      profileArn: 'arn:aws:codewhisperer:us-east-1:123:profile/auto',
      expiresIn: 3600,
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await importKiroRefreshToken('aorAAAAAG-auto-refresh-old', 'autorefresh@example.com');
    assert.equal(result.ok, true);
    const nearExpiry = Date.now() + 20 * 60 * 1000;
    db.prepare('UPDATE oauth_provider_accounts SET expires_at = ? WHERE id = ?').run(nearExpiry, result.account.id);
    refreshCalls = 0;
    const summary = await refreshExpiringAccounts({ windowMs: 40 * 60 * 1000 });
    assert.equal(summary.checked, 1);
    assert.equal(summary.refreshed, 1);
    assert.equal(summary.failed, 0);
    assert.equal(refreshCalls, 1);
    const row = db.prepare('SELECT expires_at AS expiresAt, quota_status AS quotaStatus FROM oauth_provider_accounts WHERE id = ?').get(result.account.id);
    assert.equal(row.quotaStatus, 'available');
    assert.ok(row.expiresAt > nearExpiry);
    db.prepare('DELETE FROM oauth_provider_accounts WHERE id = ?').run(result.account.id);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
