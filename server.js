import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 9879);
const HOST = process.env.HOST || 'localhost';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const ADMIN_PASSWORD = process.env.BIGLINER_PASSWORD;
const sessions = new Map();
const customKeys = [];
const providers = [
  { id: 'openai', name: 'OpenAI Compatible', format: 'openai', keys: 0, health: 99, latency: 428, cost: 0.42, status: 'online', baseUrl: 'https://api.openai.com/v1' },
  { id: 'anthropic', name: 'Anthropic Compatible', format: 'anthropic', keys: 0, health: 97, latency: 612, cost: 0.73, status: 'online', baseUrl: 'https://api.anthropic.com' },
  { id: 'local', name: 'Local Model Lane', format: 'openai', keys: 0, health: 91, latency: 184, cost: 0.00, status: 'warmup', baseUrl: 'http://localhost:11434/v1' },
  { id: 'custom', name: 'Custom Endpoint', format: 'openai', keys: 0, health: 94, latency: 351, cost: 0.28, status: 'online', baseUrl: 'custom' },
];
let logs = [
  { t: '10:08:12', app: 'Editor', route: 'openai → custom', model: 'small-model', tokens: 1840, cost: 0.018, latency: 441, result: 'ok' },
  { t: '10:09:03', app: 'CLI App', route: 'anthropic → openai', model: 'reasoning-model', tokens: 5210, cost: 0.061, latency: 773, result: 'fallback' },
  { t: '10:10:45', app: 'Notebook', route: 'local', model: 'local-model', tokens: 940, cost: 0, latency: 192, result: 'ok' },
];

function jsonHeaders(extra = {}) {
  return { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type,authorization,x-bigliner-app,x-bigliner-session', ...extra };
}
function send(res, code, data, type = 'application/json', extra = {}) {
  res.writeHead(code, type === 'application/json' ? jsonHeaders(extra) : { 'content-type': type, ...extra });
  res.end(type === 'application/json' ? JSON.stringify(data, null, 2) : data);
}
function body(req) { return new Promise(resolve => { let b=''; req.on('data', c => b += c); req.on('end', () => resolve(b)); }); }
function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(x => x.trim()).filter(Boolean).map(x => { const i=x.indexOf('='); return [x.slice(0,i), decodeURIComponent(x.slice(i+1))]; }));
}
function makeSession() { const id = crypto.randomBytes(24).toString('hex'); sessions.set(id, Date.now() + SESSION_TTL_MS); return id; }
function isAuthed(req) {
  if (!ADMIN_PASSWORD) return false;
  const token = req.headers['x-bigliner-session'] || parseCookies(req).bigliner_session;
  if (!token || !sessions.has(token)) return false;
  if (sessions.get(token) < Date.now()) { sessions.delete(token); return false; }
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return true;
}
function mask(key) { if (!key) return ''; return key.length <= 10 ? '••••' : `${key.slice(0,4)}••••${key.slice(-4)}`; }
function publicStatus(req) {
  const origin = `http://${req.headers.host || `localhost:${PORT}`}`;
  const providerView = providers.map(p => ({ ...p, keys: p.id === 'custom' ? p.keys + customKeys.length : p.keys }));
  return {
    name: 'Bigliner', mode: 'local-first', secured: true, uptime: Math.floor(process.uptime()),
    gateway: `${origin}/v1/chat/completions`,
    summary: { providers: providerView.length, keys: providerView.reduce((a,p)=>a+p.keys,0), requests: 1284 + logs.length, saved: '$18.42', cacheHit: '31%' },
    providers: providerView,
    customKeys: customKeys.map((k, i) => ({ id: i + 1, label: k.label, provider: k.provider, format: k.format, baseUrl: k.baseUrl, model: k.model, maskedKey: mask(k.apiKey), createdAt: k.createdAt })),
    logs: logs.slice(-8).reverse()
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/login' && req.method === 'POST') {
    if (!ADMIN_PASSWORD) return send(res, 503, { ok: false, error: 'BIGLINER_PASSWORD_not_configured' });
    const raw = await body(req);
    let parsed = {}; try { parsed = JSON.parse(raw || '{}'); } catch {}
    if (String(parsed.password || '') !== ADMIN_PASSWORD) return send(res, 401, { ok: false, error: 'invalid_password' });
    const token = makeSession();
    return send(res, 200, { ok: true, token, expiresIn: SESSION_TTL_MS / 1000 }, 'application/json', { 'set-cookie': `bigliner_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS/1000}` });
  }
  if (url.pathname === '/api/logout' && req.method === 'POST') {
    const token = parseCookies(req).bigliner_session; if (token) sessions.delete(token);
    return send(res, 200, { ok: true }, 'application/json', { 'set-cookie': 'bigliner_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
  }
  if (url.pathname === '/api/status') {
    if (!isAuthed(req)) return send(res, 401, { ok: false, error: 'auth_required' });
    return send(res, 200, publicStatus(req));
  }
  if (url.pathname === '/api/custom-keys' && req.method === 'POST') {
    if (!isAuthed(req)) return send(res, 401, { ok: false, error: 'auth_required' });
    const raw = await body(req);
    let parsed = {}; try { parsed = JSON.parse(raw || '{}'); } catch {}
    const item = {
      label: String(parsed.label || 'Custom Key').slice(0, 60), provider: String(parsed.provider || 'custom').slice(0, 40),
      format: ['openai','anthropic'].includes(parsed.format) ? parsed.format : 'openai', baseUrl: String(parsed.baseUrl || '').slice(0, 200),
      model: String(parsed.model || 'auto').slice(0, 80), apiKey: String(parsed.apiKey || '').slice(0, 400), createdAt: new Date().toISOString()
    };
    if (!item.baseUrl || !item.apiKey) return send(res, 400, { ok: false, error: 'baseUrl_and_apiKey_required' });
    customKeys.push(item);
    logs.push({ t: new Date().toLocaleTimeString('en-GB', { hour12: false }), app: 'Dashboard', route: `custom key → ${item.provider}`, model: item.model, tokens: 0, cost: 0, latency: 0, result: 'saved' });
    return send(res, 200, { ok: true, key: { ...item, apiKey: undefined, maskedKey: mask(item.apiKey) }, status: publicStatus(req) });
  }
  if (url.pathname === '/v1/chat/completions' && req.method === 'POST') {
    const raw = await body(req);
    let parsed = {}; try { parsed = JSON.parse(raw || '{}'); } catch {}
    const promptText = JSON.stringify(parsed.messages || parsed.prompt || '').slice(0, 220);
    const lanes = [...providers, ...customKeys.map((k, i) => ({ id: `custom-key-${i+1}`, name: k.label, latency: 310, cost: 0.25 }))];
    const chosen = lanes[Math.floor(Math.random() * lanes.length)];
    const now = new Date().toLocaleTimeString('en-GB', { hour12: false });
    logs.push({ t: now, app: req.headers['x-bigliner-app'] || 'Local App', route: `smart → ${chosen.id}`, model: parsed.model || 'auto', tokens: Math.floor(800 + Math.random()*4200), cost: Number((Math.random()*0.05).toFixed(3)), latency: (chosen.latency || 350) + Math.floor(Math.random()*80), result: 'ok' });
    return send(res, 200, { id: `chatcmpl_bigliner_${Date.now()}`, object: 'chat.completion', created: Math.floor(Date.now()/1000), model: parsed.model || 'bigliner-auto', choices: [{ index: 0, message: { role: 'assistant', content: `Bigliner mock response. Routed through ${chosen.name}. Preview: ${promptText}` }, finish_reason: 'stop' }], usage: { prompt_tokens: 123, completion_tokens: 42, total_tokens: 165 }, bigliner: { route: chosen.id, policy: 'lowest-latency-with-failover', local: true } });
  }
  if (url.pathname === '/' || url.pathname === '/index.html') return send(res, 200, fs.readFileSync(path.join(__dirname, 'public/index.html'), 'utf8'), 'text/html; charset=utf-8');
  const file = path.join(__dirname, 'public', url.pathname.replace(/^\//,''));
  if (file.startsWith(path.join(__dirname, 'public')) && fs.existsSync(file)) {
    const ext = path.extname(file);
    const type = ext === '.css' ? 'text/css; charset=utf-8' : ext === '.js' ? 'text/javascript; charset=utf-8' : 'text/plain; charset=utf-8';
    return send(res, 200, fs.readFileSync(file), type);
  }
  send(res, 404, { error: 'not_found' });
});
server.listen(PORT, HOST, () => console.log(`Bigliner prototype running on http://${HOST}:${PORT}`));
