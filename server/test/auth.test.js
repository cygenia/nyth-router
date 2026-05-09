import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureDefaultPassword, ensureDefaultUnifiedKey, checkDashboardPassword,
  createSession, touchSession, deleteSession,
  createApp, listApps, issueAppToken, findAppByToken, revokeAppToken,
  listUnifiedKeys, createUnifiedKey, findUnifiedKey, rotateUnifiedKey, revokeUnifiedKey,
  setDashboardPassword,
} from '../src/services/auth.js';

ensureDefaultPassword();
ensureDefaultUnifiedKey();

test('checkDashboardPassword accepts the seeded password', () => {
  assert.ok(checkDashboardPassword('test-password-15chars'));
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
  const touched = touchSession(s.id);
  assert.ok(touched);
  deleteSession(s.id);
  assert.equal(touchSession(s.id), null);
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
  const rotated = rotateUnifiedKey(key.id);
  assert.notEqual(rotated.key, key.key);
  // Old key no longer works.
  assert.equal(findUnifiedKey(key.key), null);
  revokeUnifiedKey(key.id);
  assert.equal(findUnifiedKey(rotated.key), null);
});
