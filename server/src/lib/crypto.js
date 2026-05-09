import crypto from 'node:crypto';
import { config } from '../config.js';

function deriveKey() {
  return crypto.createHash('sha256').update(String(config.masterKey)).digest();
}

export function encryptSecret(plaintext) {
  if (!plaintext) return '';
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecret(blob) {
  if (!blob) return '';
  if (!blob.startsWith('v1:')) return '';
  const [, ivb64, tagb64, datab64] = blob.split(':');
  if (!ivb64 || !tagb64 || !datab64) return '';
  try {
    const key = deriveKey();
    const iv = Buffer.from(ivb64, 'base64');
    const tag = Buffer.from(tagb64, 'base64');
    const encrypted = Buffer.from(datab64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

export function maskSecret(secret) {
  if (!secret) return '';
  if (secret.length <= 10) return '••••••';
  return `${secret.slice(0, 4)}••••${secret.slice(-4)}`;
}

export function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), s, 64).toString('hex');
  return `scrypt$${s}$${derived}`;
}

export function verifyPassword(password, hash) {
  if (!hash || !hash.startsWith('scrypt$')) return false;
  const [, salt, expected] = hash.split('$');
  const candidate = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(candidate, 'hex'));
}
