// Nyth API client. Always includes the dashboard session token from
// localStorage so the backend can authenticate dashboard calls.

export const SESSION_KEY = 'nyth.session';
const SESSION_EXPIRES_KEY = 'nyth.session.expiresAt';
let volatileSessionToken = '';

export type SessionDuration = 'never' | '30m' | '1h' | '6h' | '24h' | 'remember';

const SESSION_DURATION_MS: Record<Exclude<SessionDuration, 'never' | 'remember'>, number> = {
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

function expiresAtFor(duration: Exclude<SessionDuration, 'never'>): number | null {
  if (duration === 'remember') return null;
  return Date.now() + SESSION_DURATION_MS[duration];
}

function readToken() {
  if (volatileSessionToken) return volatileSessionToken;
  const token = localStorage.getItem(SESSION_KEY) || '';
  if (!token) return '';
  const expiresAt = Number(localStorage.getItem(SESSION_EXPIRES_KEY) || '0');
  if (expiresAt && Date.now() >= expiresAt) {
    clearToken();
    return '';
  }
  return token;
}

function setToken(token: string, duration: SessionDuration = 'remember') {
  if (!token) return;
  if (duration === 'never') {
    volatileSessionToken = token;
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_EXPIRES_KEY);
    return;
  }
  volatileSessionToken = '';
  localStorage.setItem(SESSION_KEY, token);
  const expiresAt = expiresAtFor(duration);
  if (expiresAt) localStorage.setItem(SESSION_EXPIRES_KEY, String(expiresAt));
  else localStorage.removeItem(SESSION_EXPIRES_KEY);
}

function clearToken() {
  volatileSessionToken = '';
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_EXPIRES_KEY);
}

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('content-type') && options.body) headers.set('content-type', 'application/json');
  const token = readToken();
  if (token) headers.set('x-nyth-session', token);
  const res = await fetch(path, { ...options, headers, credentials: 'same-origin' });
  if (res.status === 401) {
    clearToken();
    throw new ApiError('auth_required', 401);
  }
  const text = await res.text();
  let data: any = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!res.ok) {
    const message = (data && typeof data === 'object' && 'error' in data ? (data as any).error : null) || `HTTP ${res.status}`;
    throw new ApiError(String(message), res.status, data);
  }
  return data as T;
}

export const session = { read: readToken, set: setToken, clear: clearToken };
