// Bigliner API client. Always includes the dashboard session token from
// localStorage so the backend can authenticate dashboard calls.

export const SESSION_KEY = 'bigliner.session';

function readToken() {
  return localStorage.getItem(SESSION_KEY) || '';
}

function setToken(token: string) {
  if (token) localStorage.setItem(SESSION_KEY, token);
}

function clearToken() {
  localStorage.removeItem(SESSION_KEY);
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
  if (token) headers.set('x-bigliner-session', token);
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
