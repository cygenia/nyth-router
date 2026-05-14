import { findUnifiedKey, findAppByToken } from '../services/auth.js';

export function authenticateGatewayRequest(req) {
  const header = req.headers['authorization'];
  let token = '';
  if (typeof header === 'string') {
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (match) token = match[1].trim();
  }
  if (!token) return { ok: false, error: 'missing_authorization' };
  if (token.startsWith('blat_')) {
    const app = findAppByToken(token);
    if (!app) return { ok: false, error: 'invalid_app_token' };
    return { ok: true, kind: 'app', app };
  }
  const unified = findUnifiedKey(token);
  if (!unified) return { ok: false, error: 'invalid_unified_key' };
  return { ok: true, kind: 'unified', unifiedKey: unified };
}
