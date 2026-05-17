import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { syncRegistry } from './services/registrySync.js';
import { ensureDefaultPassword, ensureDefaultUnifiedKey } from './services/auth.js';
import { ensureDefaultRoutes } from './services/routeEngine.js';
import { pruneOldLogs } from './services/requestLogger.js';

import authRoutes from './routes/auth.js';
import providerRoutes from './routes/providers.js';
import keyRoutes from './routes/keys.js';
import routeRoutes from './routes/routes.js';
import usageRoutes from './routes/usage.js';
import logRoutes from './routes/logs.js';
import oauthRoutes from './routes/oauth.js';
import { startOAuthAutoRefresh } from './services/oauthPkce.js';
import settingsRoutes from './routes/settings.js';
import authJsonRoutes from './routes/authJson.js';
import playgroundRoutes from './routes/playground.js';
import systemRoutes from './routes/system.js';
import v1Routes from './routes/v1.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

syncRegistry();
ensureDefaultPassword();
ensureDefaultRoutes();
ensureDefaultUnifiedKey();
pruneOldLogs();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '4mb' }));

app.use((req, res, next) => {
  res.setHeader('access-control-allow-origin', req.headers.origin || '*');
  res.setHeader('access-control-allow-credentials', 'true');
  res.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader(
    'access-control-allow-headers',
    'content-type,authorization,x-nyth-app,x-nyth-session',
  );
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    name: 'Nyth Router',
    version: '0.2.0',
    uptime: Math.floor(process.uptime()),
    promptLogMode: config.promptLogMode,
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/keys', keyRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/usage', usageRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/oauth', oauthRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/auth-json', authJsonRoutes);
app.use('/api/playground', playgroundRoutes);
app.use('/api/system', systemRoutes);
app.use('/v1', v1Routes);

// Serve built frontend in production-style mode
const webDist = config.webDistPath;
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/v1')) return next();
    res.sendFile(path.join(webDist, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.type('text/plain').send([
      'Nyth Router API is running.',
      '',
      'The web UI hasn\'t been built yet.',
      'Run `npm run dev` to start the Vite dev server, or `npm run build` to generate web/dist.',
      '',
      `Health: http://${config.host}:${config.port}/api/health`,
      `Gateway: http://${config.host}:${config.port}/v1/chat/completions`,
    ].join('\n'));
  });
}

app.use((err, req, res, next) => {
  console.error('[nyth] error:', err);
  res.status(500).json({ ok: false, error: 'internal_error', detail: String(err.message || err) });
});

setInterval(pruneOldLogs, 6 * 60 * 60 * 1000).unref();
startOAuthAutoRefresh();

app.listen(config.port, config.host, () => {
  // eslint-disable-next-line no-console
  console.log(`Nyth Router server running at http://${config.host}:${config.port}`);
});
