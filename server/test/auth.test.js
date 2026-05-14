import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureDefaultPassword, ensureDefaultUnifiedKey, checkDashboardPassword,
  createSession, touchSession, deleteSession,
  DASHBOARD_SESSION_DURATIONS,
  createApp, listApps, issueAppToken, findAppByToken, revokeAppToken,
  listUnifiedKeys, createUnifiedKey, findUnifiedKey, rotateUnifiedKey, revokeUnifiedKey, revealUnifiedKey,
  setDashboardPassword,
} from '../src/services/auth.js';

ensureDefaultPassword();
ensureDefaultUnifiedKey();

test('checkDashboardPassword accepts the seeded password', () => {
  assert.ok(checkDashboardPassword('test-password-min-15-chars'));
  assert.ok(!checkDashboardPassword('not-the-password'));
});

test('dashboard password requires at least 15 characters', () => {
  assert.equal(setDashboardPassword('short-password'), false);
  assert.equal(setDashboardPassword('long-password-15'), true);
  assert.ok(checkDashboardPassword('long-password-15'));
});

test('sessions can be created, touched and deleted', () => {
  const s = createSession();
  assert.match(s.id, /^[a-f0-9]{48}$/);
  assert.equal(s.duration, 'remember');
  assert.equal(s.expiresAt, null);
  const touched = touchSession(s.id);
  assert.ok(touched);
  assert.equal(touched.expiresAt, null);
  deleteSession(s.id);
  assert.equal(touchSession(s.id), null);
});

test('timed dashboard sessions use selected duration', () => {
  const before = Date.now();
  const s = createSession('30m');
  assert.equal(s.duration, '30m');
  assert.ok(s.expiresAt >= before + DASHBOARD_SESSION_DURATIONS['30m'] - 50);
  assert.ok(s.expiresAt <= Date.now() + DASHBOARD_SESSION_DURATIONS['30m'] + 50);
  const touched = touchSession(s.id);
  assert.equal(touched.duration, '30m');
  assert.ok(touched.expiresAt >= Date.now() + DASHBOARD_SESSION_DURATIONS['30m'] - 50);
  deleteSession(s.id);
});

test('apps + tokens lifecycle', () => {
  const app = createApp({ name: 'My App', description: 'desc', redirectUris: ['http://localhost'], scopes: ['chat:write'] });
  assert.match(app.clientId, /^cid_/);
  assert.match(app.clientSecret, /^blcs_/);
  const apps = listApps();
  assert.ok(apps.find((a) => a.id === app.id));

  const tok = issueAppToken({ appId: app.id, scopes: ['chat:write'], ttlSeconds: 60 });
  assert.match(tok.token, /^blat_/);
  const found = findAppByToken(tok.token);
  assert.ok(found);
  assert.equal(found.appId, app.id);
  revokeAppToken(tok.id);
  assert.equal(findAppByToken(tok.token), null);
});

test('unified API keys lifecycle', () => {
  const before = listUnifiedKeys().length;
  const key = createUnifiedKey({ label: 'CI key' });
  assert.match(key.key, /^bl_/);
  assert.equal(listUnifiedKeys().length, before + 1);
  const found = findUnifiedKey(key.key);
  assert.ok(found);
  assert.equal(revealUnifiedKey(key.id).key, key.key);
  const rotated = rotateUnifiedKey(key.id);
  assert.notEqual(rotated.key, key.key);
  assert.equal(revealUnifiedKey(key.id).key, rotated.key);
  // Old key no longer works.
  assert.equal(findUnifiedKey(key.key), null);
  revokeUnifiedKey(key.id);
  assert.equal(findUnifiedKey(rotated.key), null);
});

test('custom unified API key keeps exact value without bl_ prefix', () => {
  const key = createUnifiedKey({ customKey: 'kicaumaniaaa' });
  assert.equal(key.key, 'kicaumaniaaa');
  assert.equal(findUnifiedKey('kicaumaniaaa').id, key.id);
  assert.equal(revealUnifiedKey(key.id).key, 'kicaumaniaaa');
  const listed = listUnifiedKeys().find((item) => item.id === key.id);
  assert.equal(listed.label, 'kicaumaniaaa');
  assert.equal(listed.maskedKey, 'kica••••iaaa');
});


test('custom unified API key authenticates without prefix', async () => {
  const { authenticateGatewayRequest } = await import('../src/middleware/gatewayAuth.js');
  createUnifiedKey({ customKey: 'plaincustomkey123' });
  const result = authenticateGatewayRequest({ headers: { authorization: 'Bearer plaincustomkey123' } });
  assert.equal(result.ok, true);
  assert.equal(result.kind, 'unified');
});
