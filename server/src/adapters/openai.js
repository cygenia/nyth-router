// OpenAI-compatible adapter. Forwards chat/completions to a base URL using the
// standard OpenAI HTTP shape.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function forwardChat({ baseUrl, apiKey, body, signal, authType = 'bearer', settings = {} }) {
  const headers = { 'content-type': 'application/json' };
  if (apiKey) {
    if (authType === 'api-key') headers['api-key'] = apiKey;
    else headers['authorization'] = `Bearer ${apiKey}`;
  }
  const url = trimTrailingSlash(baseUrl) + '/chat/completions';
  const maxBootstrapAttempts = Math.max(1, Number(settings.streamBootstrapRetries || 0) + 1);
  let res;
  for (let attempt = 1; attempt <= maxBootstrapAttempts; attempt += 1) {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
    if (!body?.stream || !res.ok || res.body || attempt === maxBootstrapAttempts) break;
    await sleep(Math.min(250 * attempt, 1000));
  }
  if (body?.stream && res.ok) {
    return {
      ok: true,
      status: res.status,
      statusText: res.statusText,
      stream: res.body,
      streamKeepaliveSeconds: Number(settings.streamKeepaliveSeconds || 0),
      headers: Object.fromEntries(res.headers.entries()),
    };
  }

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    data,
    rawText: text,
    headers: Object.fromEntries(res.headers.entries()),
  };
}

export async function listModels({ baseUrl, apiKey, signal, authType = 'bearer' }) {
  const headers = { };
  if (apiKey) {
    if (authType === 'api-key') headers['api-key'] = apiKey;
    else headers['authorization'] = `Bearer ${apiKey}`;
  }
  const url = trimTrailingSlash(baseUrl) + '/models';
  try {
    const res = await fetch(url, { method: 'GET', headers, signal });
    const text = await res.text();
    if (!res.ok) return { ok: false, status: res.status, error: text.slice(0, 200) };
    let data = null;
    try { data = JSON.parse(text); } catch { data = null; }
    return { ok: true, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, error: String(err.message || err) };
  }
}

export async function ping({ baseUrl, apiKey, signal, authType = 'bearer' }) {
  // Simple health check using GET /models. Does not consume tokens.
  const result = await listModels({ baseUrl, apiKey, signal, authType });
  return {
    ok: result.ok,
    status: result.status,
    error: result.ok ? undefined : result.error,
  };
}

function trimTrailingSlash(url) {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}
