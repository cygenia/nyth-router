import { Router } from 'express';
import { config } from '../config.js';
import {
  checkDashboardPassword,
  setDashboardPassword,
  validateDashboardPassword,
  MIN_DASHBOARD_PASSWORD_LENGTH,
  createSession,
  deleteSession,
  normalizeSessionDuration,
  DASHBOARD_SESSION_DURATIONS,
} from '../services/auth.js';
import { SESSION_COOKIE_NAME, requireDashboard } from '../middleware/auth.js';

const router = Router();

router.get('/state', (req, res) => {
  res.json({
    ok: true,
    requiresPassword: !!config.password || !!checkDashboardPassword(''),
    hasPassword: true,
    minPasswordLength: MIN_DASHBOARD_PASSWORD_LENGTH,
    sessionExpiresMs: config.sessionTtlMs,
  });
});

router.post('/login', (req, res) => {
  const password = String(req.body?.password || '');
  const duration = normalizeSessionDuration(req.body?.duration);
  if (!password) return res.status(400).json({ ok: false, error: 'password_required' });
  if (!checkDashboardPassword(password)) {
    return res.status(401).json({ ok: false, error: 'invalid_password' });
  }
  const session = createSession(duration);
  const cookieParts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(session.id)}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
  ];
  const ttl = DASHBOARD_SESSION_DURATIONS[duration];
  if (ttl !== null) cookieParts.push(`Max-Age=${Math.floor(ttl / 1000)}`);
  res.setHeader('set-cookie', cookieParts.join('; '));
  res.json({ ok: true, token: session.id, expiresAt: session.expiresAt, duration: session.duration });
});

router.post('/logout', (req, res) => {
  const cookieToken = (req.headers?.cookie || '')
    .split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.split('=')[1];
  if (cookieToken) deleteSession(decodeURIComponent(cookieToken));
  res.setHeader('set-cookie', `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  res.json({ ok: true });
});

router.post('/password', requireDashboard, (req, res) => {
  const next = String(req.body?.newPassword || req.body?.password || '');
  if (!validateDashboardPassword(next)) {
    return res.status(400).json({
      ok: false,
      error: 'password_too_short',
      minLength: MIN_DASHBOARD_PASSWORD_LENGTH,
    });
  }
  setDashboardPassword(next);
  res.json({ ok: true });
});

export default router;
