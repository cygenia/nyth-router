import './setup.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptSecret, decryptSecret, maskSecret, hashPassword, verifyPassword } from '../src/lib/crypto.js';

test('encryptSecret + decryptSecret round-trips', () => {
  const plain = 'sk-test-1234567890';
  const enc = encryptSecret(plain);
  assert.notEqual(enc, plain);
  assert.match(enc, /^v1:/);
  assert.equal(decryptSecret(enc), plain);
});

test('decryptSecret returns empty string for tampered ciphertext', () => {
  const enc = encryptSecret('hello');
  const tampered = enc.slice(0, -2) + 'AA';
  assert.equal(decryptSecret(tampered), '');
});

test('maskSecret keeps prefix/suffix only', () => {
  assert.equal(maskSecret('sk-abcdefgh1234'), 'sk-a••••1234');
  assert.equal(maskSecret('short'), '••••••');
});

test('hashPassword + verifyPassword round-trips', () => {
  const hash = hashPassword('hunter2');
  assert.match(hash, /^scrypt\$/);
  assert.ok(verifyPassword('hunter2', hash));
  assert.ok(!verifyPassword('wrong', hash));
});
