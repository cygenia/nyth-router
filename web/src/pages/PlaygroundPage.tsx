import { useEffect, useState } from 'react';
import { Page } from '../components/Page';
import { Icons } from '../lib/icons';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { Dropdown } from '../components/Dropdown';
import { copyToClipboard, formatCurrency, formatLatency, formatNumber } from '../lib/format';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export default function PlaygroundPage() {
  const [routes, setRoutes] = useState<any[]>([]);
  const [keys, setKeys] = useState<any[]>([]);
  const [available, setAvailable] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountId, setAccountId] = useState('');
  const [model, setModel] = useState('nyth-smart');
  const [system, setSystem] = useState('You are Nyth, a helpful, fast, friendly assistant.');
  const [user, setUser] = useState('Hello! What can you do?');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(512);
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const [decision, setDecision] = useState<any>(null);
  const [estimate, setEstimate] = useState<any>(null);
  const toast = useToast();

  useEffect(() => {
    api<any>('/api/routes').then((r) => setRoutes(r.routes || [])).catch(() => undefined);
    api<any>('/api/oauth/unified-keys').then((r) => setKeys(r.keys || [])).catch(() => undefined);
    api<any>('/api/playground/models').then((r) => setAvailable((r.providers || []).filter((p: any) => p.available))).catch(() => undefined);
    api<any>('/api/oauth/provider-accounts').then((r) => setAccounts(r.accounts || [])).catch(() => undefined);
  }, []);

  async function decisionPreview() {
    const data = await api<any>('/api/playground/decision', {
      method: 'POST',
      body: JSON.stringify({ model }),
    });
    setDecision(data.decision);
  }

  async function estimatePreview() {
    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
    const data = await api<any>('/api/playground/estimate', { method: 'POST', body: JSON.stringify({ messages }) });
    setEstimate(data);
  }

  async function run() {
    setBusy(true);
    setResponse(null);
    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ];
      const data = await api<any>('/api/playground/run', {
        method: 'POST',
        body: JSON.stringify({
          request: {
            model,
            messages,
            temperature,
            max_tokens: maxTokens,
            ...(accountId ? { nyth: { providerAccountId: accountId } } : {}),
          },
        }),
      });
      setResponse(data.result);
      setDecision(data.decision);
      if (!data.ok) toast.push('Request failed. Check route, provider key, or OAuth account.', 'error');
    } catch (err: any) {
      const payload = err?.data?.result || err?.data || { error: err?.message || 'Request failed' };
      setResponse(payload);
      setDecision(err?.data?.decision || null);
      toast.push(err?.message || 'Request failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function exportCurl() {
    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
    const data = await api<any>('/api/playground/curl', {
      method: 'POST',
      body: JSON.stringify({ model, messages, apiKey: 'YOUR_UNIFIED_KEY' }),
    });
    copyToClipboard(data.curl);
    toast.push('curl command copied to clipboard.', 'success');
  }

  const choice = response?.choices?.[0];
  const usage = response?.usage;
  const meta = response?.nyth;
  const oauthAccountProvider = model.startsWith('codex/') || model.startsWith('codex:') ? 'codex' : model.startsWith('claude-oauth/') || model.startsWith('claude-oauth:') ? 'anthropic' : model.startsWith('gemini-oauth/') || model.startsWith('gemini-oauth:') ? 'gemini' : model.startsWith('kiro/') || model.startsWith('kiro:') ? 'kiro' : '';
  const matchingAccounts = oauthAccountProvider ? accounts.filter((acct) => acct.providerId === oauthAccountProvider) : [];

  return (
    <Page
      title="Playground"
      description="Test prompts against a route or model before integrating an external app. See the route decision, latency, cost, and a curl snippet."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={decisionPreview} className="btn-ghost">
            <Icons.Wand2 className="h-4 w-4" /> Show decision
          </button>
          <button onClick={estimatePreview} className="btn-ghost">
            <Icons.Sparkles className="h-4 w-4" /> Estimate
          </button>
          <button onClick={exportCurl} className="btn-ghost">
            <Icons.TerminalSquare className="h-4 w-4" /> Copy curl
          </button>
          <button onClick={run} disabled={busy} className="btn-primary">
            {busy ? <Icons.Loader2 className="h-4 w-4 animate-spin" /> : <Icons.Sparkles className="h-4 w-4" />}
            Send
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="panel p-5 lg:col-span-2">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="field-label">Model / route</label>
              <input className="field-input mt-1 font-mono" value={model} onChange={(e) => setModel(e.target.value)} placeholder="nyth-smart, codex/gpt-5.5, openai/gpt-5.5" />
              <div className="mt-2 flex flex-wrap gap-1">
                {routes.slice(0, 6).map((r) => (
                  <button key={r.id} onClick={() => setModel(r.alias || r.id)} className="pill text-[10px] hover:text-aurora-mint">
                    {r.alias || r.name}
                  </button>
                ))}
              </div>
              {available.length > 0 && (
                <Dropdown
                  className="mt-2"
                  value=""
                  placeholder="Available models from connected keys/OAuth..."
                  options={available.flatMap((p: any) => (p.models || []).map((m: any) => ({
                    value: m.modelRef || `${p.id}/${m.id}`,
                    label: m.modelRef || `${p.id}/${m.id}`,
                    description: `${p.name}, ${m.displayName || m.id}`,
                  })))}
                  onChange={(value) => { if (value) setModel(value); }}
                />
              )}
              {matchingAccounts.length > 0 && (
                <Dropdown
                  className="mt-2"
                  value={accountId}
                  placeholder="Default OAuth account"
                  options={[{ value: '', label: 'Default OAuth account' }, ...matchingAccounts.map((acct: any) => ({ value: acct.id, label: acct.accountLabel || acct.accountEmail || acct.id, description: acct.accountEmail || acct.providerName }))]}
                  onChange={setAccountId}
                />
              )}
            </div>
            <div>
              <label className="field-label">Temperature</label>
              <input
                type="number"
                step={0.1}
                min={0}
                max={2}
                className="field-input mt-1"
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value || 0))}
              />
            </div>
            <div>
              <label className="field-label">Max tokens</label>
              <input
                type="number"
                step={32}
                min={1}
                className="field-input mt-1"
                value={maxTokens}
                onChange={(e) => setMaxTokens(Number(e.target.value || 1))}
              />
            </div>
          </div>
          <div className="mt-3">
            <label className="field-label">System prompt</label>
            <textarea
              className="field-input mt-1 min-h-[80px]"
              value={system}
              onChange={(e) => setSystem(e.target.value)}
            />
          </div>
          <div className="mt-3">
            <label className="field-label">User message</label>
            <textarea
              className="field-input mt-1 min-h-[140px]"
              value={user}
              onChange={(e) => setUser(e.target.value)}
            />
          </div>
        </section>

        <section className="panel p-5">
          <h3 className="font-display text-lg font-semibold text-ink-50">Response</h3>
          {!response && (
            <p className="mt-3 text-sm text-ink-300">Send a request to see the response, route decision, and cost estimate here.</p>
          )}
          {response && (
            <div className="mt-3 space-y-3">
              {response.error ? (
                <pre className="max-h-72 overflow-auto pretty-scroll rounded-2xl border border-aurora-rose/40 bg-aurora-rose/10 p-3 text-xs text-aurora-rose whitespace-pre-wrap">
{JSON.stringify(response.error, null, 2)}
                </pre>
              ) : (
                <pre className="max-h-72 overflow-auto pretty-scroll rounded-2xl border border-white/10 bg-ink-900/70 p-3 text-sm text-ink-100 whitespace-pre-wrap">
{choice?.message?.content || '(no content)'}
                </pre>
              )}
              {meta && (
                <div className="flex flex-wrap gap-1 text-[10px]">
                  <span className="pill"><Icons.Plug className="h-3 w-3" /> {meta.provider}</span>
                  <span className="pill-aurora"><Icons.Sparkles className="h-3 w-3" /> {meta.model}</span>
                  <span className="pill"><Icons.Gauge className="h-3 w-3" /> {formatLatency(meta.latencyMs)}</span>
                  <span className="pill-mint"><Icons.LineChart className="h-3 w-3" /> {formatCurrency(meta.estimatedCost)}</span>
                  {usage && <span className="pill"><Icons.Activity className="h-3 w-3" /> {formatNumber(usage.total_tokens)} tokens</span>}
                </div>
              )}
            </div>
          )}

          {decision && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-300">Route decision</h4>
              <pre className="mt-2 max-h-48 overflow-auto pretty-scroll rounded-2xl border border-white/10 bg-ink-900/70 p-3 font-mono text-xs text-ink-100">
{JSON.stringify(decision, null, 2)}
              </pre>
            </div>
          )}

          {estimate && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-300">Cheaper alternatives</h4>
              <p className="text-xs text-ink-300">Estimated {formatNumber(estimate.inputTokens)} in / {formatNumber(estimate.outputTokensEstimate)} out</p>
              <ul className="mt-2 space-y-1 text-xs">
                {estimate.cheapest.slice(0, 5).map((c: any) => (
                  <li key={`${c.providerId}-${c.modelId}`} className="flex justify-between rounded-xl border border-white/10 bg-white/5 px-2 py-1">
                    <span className="font-mono">{c.providerId}/{c.modelId}</span>
                    <span className="text-aurora-mint">{formatCurrency(c.estimatedCost)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
      {keys.length > 0 && (
        <section className="panel p-5">
          <h3 className="font-display text-lg font-semibold text-ink-50">External app integration</h3>
          <p className="text-sm text-ink-300">
            Apps can connect using any Nyth key, including custom keys without a prefix, on the standard
            <code className="ml-1 font-mono">/v1/chat/completions</code> endpoint. Manage keys on the API keys page.
          </p>
        </section>
      )}
    </Page>
  );
}
