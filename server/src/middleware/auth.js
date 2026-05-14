import { touchSession } from '../services/auth.js';

const SESSION_COOKIE = 'nyth_session';

function parseCookies(req) {
  const out = {};
  const header = req.headers?.cookie;
  if (!header) return out;
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    out[trimmed.slice(0, idx)] = decodeURIComponent(trimmed.slice(idx + 1));
  }
  return out;
}

export function readSession(req) {
  const headerToken = req.headers['x-nyth-session'];
  if (typeof headerToken === 'string' && headerToken.length) {
    const valid = touchSession(headerToken);
    if (valid) return { token: headerToken };
  }
  const cookies = parseCookies(req);
  if (cookies[SESSION_COOKIE]) {
    const valid = touchSession(cookies[SESSION_COOKIE]);
    if (valid) return { token: cookies[SESSION_COOKIE] };
  }
  return null;
}

export function requireDashboard(req, res, next) {
  const session = readSession(req);
  if (!session) {
    return res.status(401).json({ ok: false, error: 'auth_required' });
  }
  req.session = session;
  next();
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
