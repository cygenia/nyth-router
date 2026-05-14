import { useEffect, useMemo, useState } from 'react';
import { Page } from '../components/Page';
import { Icons } from '../lib/icons';
import { copyToClipboard } from '../lib/format';
import { ProviderLogo } from '../lib/providerBranding';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { Dropdown } from '../components/Dropdown';

type OAuthProvider = {
  id: string;
  name: string;
  callbackUrl: string;
  mode?: string;
  connected: boolean;
  accountCount?: number;
  note: string;
};

type OAuthSession = {
  provider: { id: string; name: string };
  authUrl: string;
  state: string;
  codeChallenge: string;
  callbackUrl: string;
  expiresInSeconds: number;
};

const providerLogoId: Record<string, string> = {
  codex: 'openai',
  'codex-microsoft': 'openai',
  anthropic: 'anthropic',
  'claude-oauth': 'anthropic',
  gemini: 'google',
  'gemini-oauth': 'google',
};

function accountProviderId(providerId: string) {
  if (providerId === 'codex-microsoft') return 'codex';
  if (providerId === 'claude-oauth') return 'anthropic';
  if (providerId === 'gemini-oauth') return 'gemini';
  return providerId;
}

function ModelAliasPanel({ providerId, models, onChanged, onToast }: { providerId: string; models: any[]; onChanged: () => void; onToast: (message: string, type?: 'success' | 'error' | 'info') => void }) {
  const [selected, setSelected] = useState('');
  const [manualModel, setManualModel] = useState('');
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    setSelected(models?.[0]?.modelRef || '');
  }, [models]);

  const model = models.find((m: any) => (m.modelRef || '') === selected) || models?.[0];
  const aliases = model ? [model.modelRef || model.canonical, ...(model.aliases || [])].filter(Boolean) : [];

  async function copy(value: string) {
    await copyToClipboard(value);
    onToast('Model alias copied.');
  }

  async function addManualModel() {
    const raw = manualModel.trim();
    if (!raw) return;
    const modelId = raw.includes('/') ? raw.split('/').slice(1).join('/') : raw;
    await api(`/api/providers/${providerId}/models`, {
      method: 'POST',
      body: JSON.stringify({ id: modelId, displayName: modelId }),
    });
    setManualModel('');
    await onChanged();
    onToast(`Manual model added: ${providerId}/${modelId}`);
  }

  async function removeSelectedModel() {
    const current = models.find((m: any) => (m.modelRef || '') === selected) || model;
    if (!current) return;
    const modelId = current.id || String(current.modelRef || current.canonical || '').split('/').slice(1).join('/');
    if (!modelId) return;
    if (!confirm(`Remove model ${providerId}/${modelId} from OAuth model list? Routes using it will no longer resolve.`)) return;
    setRemoving(true);
    try {
      await api(`/api/providers/${providerId}/models/${encodeURIComponent(modelId)}`, { method: 'DELETE' });
      await onChanged();
      onToast(`Model removed: ${providerId}/${modelId}`);
    } catch (error: any) {
      onToast(`Remove failed: ${error?.message || error}`, 'error');
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-ink-950/35 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-aurora-sky">Available model aliases</div>
          <div className="text-xs text-ink-300">Copy, add, or remove canonical model strings for this OAuth provider.</div>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => aliases[0] && copy(aliases[0])} disabled={!aliases[0]} className="btn-ghost px-3 py-1 text-xs"><Icons.Copy className="h-3.5 w-3.5" /> Copy selected</button>
          <button type="button" onClick={removeSelectedModel} disabled={!model || removing} className="btn-danger px-3 py-1 text-xs"><Icons.Trash2 className="h-3.5 w-3.5" /> {removing ? 'Removing...' : 'Remove model'}</button>
        </div>
      </div>
      {models?.length ? (
        <>
          <Dropdown
            className="mt-3"
            value={selected}
            options={models.map((m: any) => ({
              value: m.modelRef || m.canonical,
              label: m.modelRef || m.canonical,
              description: m.displayName || m.display || m.id,
            }))}
            onChange={setSelected}
            placeholder="Select model alias"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            {aliases.slice(0, 6).map((alias: string) => (
              <button key={alias} type="button" onClick={() => copy(alias)} className="rounded-xl border border-white/10 bg-white/5 px-2 py-1 font-mono text-[11px] text-ink-100 hover:bg-white/10">
                {alias}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-2 text-xs text-ink-300">No models listed yet. Add one manually below.</div>
      )}
      <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3">
        <div className="text-[10px] uppercase tracking-wider text-aurora-mint">Add model manually</div>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input className="field-input min-h-0 py-2 font-mono text-xs" value={manualModel} onChange={(event) => setManualModel(event.target.value)} placeholder={`${providerId}/model-id or model-id`} />
          <button type="button" onClick={addManualModel} disabled={!manualModel.trim()} className="btn-primary px-3 py-2 text-xs">Add model</button>
        </div>
      </div>
    </div>
  );
}

export default function OAuthProviderLoginPage() {
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  const [selected, setSelected] = useState('codex');
  const [session, setSession] = useState<OAuthSession | null>(null);
  const [callbackUrl, setCallbackUrl] = useState('');
  const [kiroRefreshToken, setKiroRefreshToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [available, setAvailable] = useState<any[]>([]);
  const toast = useToast();

  useEffect(() => {
    void loadProviders();
    void loadAvailableModels();
  }, []);

  const provider = useMemo(() => providers.find((p) => p.id === selected) || providers[0], [providers, selected]);
  const providerModelId = accountProviderId(selected);
  const selectedModels = useMemo(() => available.find((p: any) => p.id === providerModelId)?.models || [], [available, providerModelId]);

  async function loadProviders() {
    const data = await api<{ providers: OAuthProvider[] }>('/api/oauth/providers');
    setProviders(data.providers || []);
    if (data.providers?.[0] && !data.providers.some((p) => p.id === selected)) setSelected(data.providers[0].id);
  }

  async function loadAvailableModels() {
    const data = await api<any>('/api/playground/models');
    setAvailable(data.providers || []);
  }

  async function startAuth() {
    if (!provider) return;
    if (provider.mode === 'refresh-token-import') {
      toast.push('Use Kiro Connect below: auto-detect from browser/cache or paste locally. Do not send tokens in chat.', 'info');
      return;
    }
    setLoading(true);
    setCallbackUrl('');
    try {
      const data = await api<{ session: OAuthSession }>(`/api/oauth/providers/${provider.id}/start`, { method: 'POST' });
      setSession(data.session);
      await copyToClipboard(data.session.authUrl);
      toast.push('One-time provider login URL generated and copied.', 'success');
    } catch (error: any) {
      toast.push(`Failed to start OAuth: ${error.message || error}`, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function submitCallback() {
    if (!provider || !callbackUrl.trim()) return;
    setSubmitting(true);
    try {
      const result = await api(`/api/oauth/providers/${provider.id}/callback`, {
        method: 'POST',
        body: JSON.stringify({ callbackUrl: callbackUrl.trim() }),
      });
      toast.push((result as any).ok ? `${provider.name} connected.` : 'Callback received, token exchange failed.', (result as any).ok ? 'success' : 'error');
      await loadProviders();
      await loadAvailableModels();
    } catch (error: any) {
      toast.push(`Callback failed: ${error.message || error}`, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function importKiroToken(auto = false) {
    setSubmitting(true);
    try {
      const result = await api(auto ? '/api/oauth/providers/kiro/auto-import' : '/api/oauth/providers/kiro/import', {
        method: 'POST',
        body: auto ? JSON.stringify({}) : JSON.stringify({ refreshToken: kiroRefreshToken.trim() }),
      });
      const source = (result as any).sourceType ? ` via ${(result as any).sourceType}` : '';
      toast.push((result as any).ok ? `Kiro account connected${source}. Token encrypted and never shown again.` : 'Kiro import failed.', (result as any).ok ? 'success' : 'error');
      setKiroRefreshToken('');
      await loadProviders();
      await loadAvailableModels();
    } catch (error: any) {
      toast.push(`Kiro import failed: ${error.message || error}`, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Page
      title="Provider App access"
      description="Connect provider accounts using OAuth callback paste or secure local token import. Tokens are stored encrypted server-side and never shown again."
      actions={<button onClick={startAuth} disabled={!provider || loading || provider?.mode === 'refresh-token-import'} className="btn-primary min-w-[170px] px-4 py-2 text-sm"><Icons.ShieldCheck className="h-4 w-4" /> {provider?.mode === 'refresh-token-import' ? 'Kiro Connect below' : loading ? 'Generating...' : 'Generate login link'}</button>}
    >
      <section className="panel p-5">
        <div className="grid gap-4 lg:grid-cols-[.9fr_1.1fr]">
          <div>
            <h3 className="font-display text-lg font-semibold text-ink-50">Choose CLI / account provider</h3>
            <p className="mt-2 text-sm text-ink-300">Provider-owned localhost callbacks avoid public redirect issues. Paste the final callback URL back here after login.</p>
            <div className="mt-4 grid gap-2">
              {providers.map((item) => (
                <button key={item.id} type="button" onClick={() => { setSelected(item.id); setSession(null); setCallbackUrl(''); setKiroRefreshToken(''); }} className={`rounded-3xl border p-3 text-left transition-colors ${selected === item.id ? 'border-aurora-mint/50 bg-aurora-mint/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}>
                  <div className="flex items-center gap-3">
                    <ProviderLogo id={providerLogoId[item.id] || item.id} name={item.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-ink-50">{item.name}</div>
                      <div className="truncate text-[11px] text-ink-300">{item.mode === 'refresh-token-import' ? 'Kiro Connect: browser/cache or local paste' : `CLI callback: ${item.callbackUrl}`}</div>
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${item.connected ? 'border-aurora-mint/40 bg-aurora-mint/10 text-aurora-mint' : 'border-aurora-sky/40 bg-aurora-sky/10 text-aurora-sky'}`}>{item.connected ? `${item.accountCount || 1} account${(item.accountCount || 1) > 1 ? 's' : ''}` : item.mode === 'refresh-token-import' ? 'secure connect' : 'callback paste'}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
            {provider && (
              <>
                <div className="flex items-center gap-3">
                  <ProviderLogo id={providerLogoId[provider.id] || provider.id} name={provider.name} size="lg" />
                  <div>
                    <h3 className="font-display text-lg font-semibold text-ink-50">{provider.name}</h3>
                    <p className="text-xs text-ink-300">Secure callback paste mode</p>
                  </div>
                </div>
                <p className="mt-4 text-sm text-ink-300">{provider.note}</p>

                {provider.mode === 'refresh-token-import' && (
                  <div className="mt-4 rounded-2xl border border-aurora-mint/25 bg-aurora-mint/10 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-aurora-mint">Kiro Connect</div>
                    <p className="mt-1 text-xs text-ink-300">Connect Kiro.dev without sending tokens in chat. Prefer browser/cache auto-detect when this server has a logged-in app.kiro.dev browser profile; otherwise paste the refresh token locally here. Raw tokens are encrypted server-side, never logged, and never shown again.</p>
                    <div className="mt-3 grid gap-2 rounded-2xl border border-white/10 bg-ink-950/30 p-3 text-xs text-ink-300">
                      <div><span className="font-semibold text-ink-100">Auto-detect:</span> reads local browser cookies/cache for app.kiro.dev and stores a safe local cache if found.</div>
                      <div><span className="font-semibold text-ink-100">Local paste:</span> paste only inside this dashboard over the local Nyth session; never paste the token in Telegram/chat.</div>
                    </div>
                    <textarea value={kiroRefreshToken} onChange={(event) => setKiroRefreshToken(event.target.value)} placeholder="Paste Kiro refreshToken locally here — never in chat" className="mt-3 min-h-24 w-full rounded-2xl border border-white/10 bg-ink-950/45 p-3 text-xs text-ink-100 outline-none transition-colors focus:border-aurora-mint/60" />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button onClick={() => importKiroToken(true)} disabled={submitting} className="btn-primary"><Icons.RefreshCcw className="h-4 w-4" /> {submitting ? 'Detecting...' : 'Auto-detect from browser/cache'}</button>
                      <button onClick={() => importKiroToken(false)} disabled={submitting || !kiroRefreshToken.trim()} className="btn-ghost"><Icons.ShieldCheck className="h-4 w-4" /> {submitting ? 'Importing...' : 'Import pasted token locally'}</button>
                    </div>
                  </div>
                )}

                {session && (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-ink-950/40 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-aurora-sky">Generated login URL</div>
                    <code className="mt-2 block max-h-28 overflow-auto break-all rounded-xl border border-white/10 bg-black/20 p-2 text-[11px] text-ink-100">{session.authUrl}</code>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" onClick={() => copyToClipboard(session.authUrl)} className="btn-ghost px-3 py-1 text-xs"><Icons.Copy className="h-3.5 w-3.5" /> Copy URL</button>
                      <a href={session.authUrl} target="_blank" rel="noreferrer" className="btn-primary px-3 py-1 text-xs">Open login</a>
                    </div>
                    <textarea value={callbackUrl} onChange={(event) => setCallbackUrl(event.target.value)} placeholder="Paste final localhost callback URL here" className="mt-3 min-h-20 w-full rounded-2xl border border-white/10 bg-ink-950/45 p-3 text-xs text-ink-100 outline-none transition-colors focus:border-aurora-violet/60" />
                    <button type="button" onClick={submitCallback} disabled={submitting || !callbackUrl.trim()} className="btn-primary mt-2 px-3 py-2 text-xs">Submit callback</button>
                  </div>
                )}

                <ModelAliasPanel providerId={providerModelId} models={selectedModels} onChanged={loadAvailableModels} onToast={(message, type = 'success') => toast.push(message, type)} />
              </>
            )}
          </div>
        </div>
      </section>
    </Page>
  );
}
