import { Router } from 'express';
import { config } from '../config.js';
import {
  checkDashboardPassword,
  setDashboardPassword,
  createSession,
  deleteSession,
} from '../services/auth.js';
import { SESSION_COOKIE_NAME, requireDashboard } from '../middleware/auth.js';

const router = Router();

router.get('/state', (req, res) => {
  res.json({
    ok: true,
    requiresPassword: !!config.password || !!checkDashboardPassword(''),
    hasPassword: true,
    sessionExpiresMs: config.sessionTtlMs,
  });
});

router.post('/login', (req, res) => {
  const password = String(req.body?.password || '');
  if (!password) return res.status(400).json({ ok: false, error: 'password_required' });
  if (!checkDashboardPassword(password)) {
    return res.status(401).json({ ok: false, error: 'invalid_password' });
  }
  const session = createSession();
  res.setHeader(
    'set-cookie',
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(session.id)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(config.sessionTtlMs / 1000)}`,
  );
  res.json({ ok: true, token: session.id, expiresAt: session.expiresAt });
});

router.post('/logout', (req, res) => {
  const cookieToken = req.headers.cookie?.split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.split('=')[1];
  if (cookieToken) deleteSession(decodeURIComponent(cookieToken));
  res.setHeader('set-cookie', `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
  res.json({ ok: true });
});

router.post('/password', requireDashboard, (req, res) => {
  const next = String(req.body?.password || '');
  if (next.length < 4) return res.status(400).json({ ok: false, error: 'password_too_short' });
  setDashboardPassword(next);
  res.json({ ok: true });
});

export default router;
