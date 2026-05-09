import crypto from 'node:crypto';

const ALPHA = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function nanoid(length = 16) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHA[bytes[i] % ALPHA.length];
  }
  return out;
}

export function prefixedId(prefix, length = 12) {
  return `${prefix}_${nanoid(length)}`;
}

export function unifiedKey() {
  return `bl_${crypto.randomBytes(28).toString('base64url')}`;
}

export function appToken() {
  return `blat_${crypto.randomBytes(28).toString('base64url')}`;
}

export function clientSecret() {
  return `blcs_${crypto.randomBytes(28).toString('base64url')}`;
}

export function sessionToken() {
  return crypto.randomBytes(24).toString('hex');
}
