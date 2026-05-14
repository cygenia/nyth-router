import { useEffect, useState } from 'react';
import { Page } from '../components/Page';
import { Skeleton } from '../components/Skeleton';
import { Empty } from '../components/Empty';
import { Icons } from '../lib/icons';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { copyToClipboard, relativeTime } from '../lib/format';

function Mini({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-2 py-1">
      <div className="text-[9px] uppercase tracking-wider text-ink-300">{label}</div>
      <div className="truncate text-ink-100">{String(value || 'needs check')}</div>
    </div>
  );
}

function ObservedUsage({ windows }: { windows: any[] }) {
  if (!windows?.length) return null;
  return (
    <div className="mt-3 space-y-2">
      {windows.map((q) => {
        const hasQuota = !!q.capacity;
        const tokenLabel = q.tokens ? `${Number(q.tokens).toLocaleString()} tok` : '0 tok';
        return (
          <div key={`${q.label}-${q.resetAt}`} className="rounded-xl border border-white/10 bg-black/10 p-2">
            <div className="flex items-center justify-between gap-2 text-[10px]">
              <span className="font-semibold text-ink-100">{q.label || 'Usage'}</span>
              <span className="text-ink-300">{q.used || 0} req · {tokenLabel}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-ink-400">
              <span>{q.resetAt ? `resets ${relativeTime(q.resetAt)}` : 'reset unknown'}</span>
              <span>{hasQuota ? `${q.percent || 0}% used` : 'tracked only'}</span>
            </div>
            {hasQuota && (
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                <div className={`h-full rounded-full ${q.percent >= 90 ? 'bg-aurora-rose' : q.percent >= 70 ? 'bg-aurora-amber' : 'bg-aurora-mint'}`} style={{ width: `${Math.min(100, q.percent || 0)}%` }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function statusBadge(detail: any, fallback: string) {
  const status = detail?.status || fallback || 'unknown';
  const label = detail?.label || status;
  const klass = status === 'available'
    ? 'border-aurora-mint/40 bg-aurora-mint/10 text-aurora-mint'
    : status === 'provider_limited' || status === 'account_verification_required' || status === 'expired' || status === 'refresh_required'
      ? 'border-aurora-rose/40 bg-aurora-rose/10 text-aurora-rose'
      : 'border-aurora-amber/40 bg-aurora-amber/10 text-aurora-amber';
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] ${klass}`}>{label}</span>;
}

export default function OAuthManagePage() {
  const [apps, setApps] = useState<any[]>([]);
  const [tokens, setTokens] = useState<Record<string, any[]>>({});
  const [providerAccounts, setProviderAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openApp, setOpenApp] = useState<string | null>(null);
  const [testingAll, setTestingAll] = useState(false);
  const [testSummary, setTestSummary] = useState<any>(null);
  const toast = useToast();

  async function load() {
    setLoading(true);
    try {
      const data = await api<any>('/api/oauth/apps');
      setApps(data.apps || []);
      setProviderAccounts(data.providerAccounts || []);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function loadTokens(appId: string) {
    const data = await api<any>(`/api/oauth/apps/${appId}/tokens`);
    setTokens((prev) => ({ ...prev, [appId]: data.tokens || [] }));
  }

  async function rotate(appId: string) {
    if (!confirm('Rotate client secret? Existing apps using the old secret will need to update.')) return;
    const data = await api<any>(`/api/oauth/apps/${appId}/rotate`, { method: 'POST' });
    copyToClipboard(data.clientSecret);
    toast.push('New client secret copied to clipboard.', 'success');
  }

  async function deleteApp(appId: string) {
    if (!confirm('Delete this app and revoke all tokens?')) return;
    await api(`/api/oauth/apps/${appId}`, { method: 'DELETE' });
    toast.push('App deleted.', 'success');
    load();
  }

  async function revokeToken(tokenId: string, appId: string) {
    await api(`/api/oauth/tokens/${tokenId}/revoke`, { method: 'POST' });
    loadTokens(appId);
    toast.push('Token revoked.', 'success');
  }


  async function setDefaultProviderAccount(acct: any) {
    await api(`/api/oauth/provider-accounts/${acct.providerId}/${acct.id}/default`, { method: 'POST' });
    toast.push(`${acct.providerName} account set as default.`, 'success');
    load();
  }

  async function deleteProviderAccount(acct: any) {
    const label = acct.accountEmail || acct.accountLabel || acct.maskedAccessToken || acct.id;
    if (!confirm(`Remove provider account ${label}?`)) return;
    await api(`/api/oauth/provider-accounts/${acct.providerId}/${acct.id}`, { method: 'DELETE' });
    toast.push('Provider account removed.', 'success');
    load();
  }

  async function testAllProviderAuth() {
    setTestingAll(true);
    try {
      const result = await api<any>('/api/oauth/provider-accounts/test-all', { method: 'POST' });
      setProviderAccounts(result.accounts || []);
      setTestSummary(result);
      const total = result.total || (result.results || []).length;
      const okCount = result.ok || 0;
      const failed = result.failed || 0;
      const limited = result.limited || 0;
      const expired = result.expired || 0;
      toast.push(`Test Auth all complete: ${okCount}/${total} usable, ${failed} failed, ${limited} limited, ${expired} expired.`, failed ? 'error' : 'success');
    } catch (err: any) {
      toast.push(err?.data?.error || err?.message || 'Test Auth all failed', 'error');
    } finally {
      setTestingAll(false);
    }
  }

  async function testProviderAccount(acct: any) {
    try {
      const result = await api(`/api/oauth/provider-accounts/${acct.providerId}/${acct.id}/test`, { method: 'POST' });
      toast.push((result as any).ok ? `${acct.providerName} account is usable.` : `${acct.providerName} account check failed.`, (result as any).ok ? 'success' : 'error');
    } catch (err: any) {
      toast.push(err?.data?.error || err?.message || 'OAuth account check failed', 'error');
    } finally {
      load();
    }
  }

  async function repairKiroAccount(acct: any) {
    try {
      const result = await api(`/api/oauth/provider-accounts/${acct.providerId}/${acct.id}/repair`, { method: 'POST' });
      toast.push((result as any).ok ? `Kiro.dev token repaired from browser/cache${(result as any).sourceType ? ` (${(result as any).sourceType})` : ''}.` : 'Kiro.dev repair failed.', (result as any).ok ? 'success' : 'error');
    } catch (err: any) {
      toast.push(err?.data?.error || err?.message || 'Kiro.dev repair failed', 'error');
    } finally {
      load();
    }
  }

  return (
    <Page
      title="Connected apps"
      description="Manage connected apps, access, limits, and revocation. Apps can use Nyth without seeing provider keys."
    >
      {loading ? (
        <Skeleton rows={3} height={120} />
      ) : (
        <div className="space-y-4">
          <section className="panel p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-semibold text-ink-50">Provider account tokens</h3>
                <p className="text-sm text-ink-300">Tokens connected from Codex, Claude, and Gemini provider login. Multiple accounts per provider are supported. The default account is used unless a request selects a specific account.</p>
              </div>
              <button onClick={testAllProviderAuth} disabled={testingAll || providerAccounts.length === 0} className="btn-primary px-3 py-1 text-xs">
                {testingAll ? <Icons.Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icons.ShieldCheck className="h-3.5 w-3.5" />}
                {testingAll ? 'Testing all...' : 'Test Auth all'}
              </button>
            </div>
            {testSummary && (
              <div className="mt-4 grid gap-2 text-xs sm:grid-cols-5">
                <Mini label="Checked" value={testSummary.total || 0} />
                <Mini label="Usable" value={testSummary.ok || 0} />
                <Mini label="Failed" value={testSummary.failed || 0} />
                <Mini label="Limited" value={testSummary.limited || 0} />
                <Mini label="Expired" value={testSummary.expired || 0} />
              </div>
            )}
            {providerAccounts.length === 0 ? (
              <p className="mt-4 text-sm text-ink-300">No provider accounts connected yet. Use OAuth Login to connect Codex, Claude, or Gemini. You can connect multiple accounts per provider.</p>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {providerAccounts.map((acct) => (
                  <div key={acct.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-ink-50">{acct.providerName}</div>
                        <div className="truncate text-xs text-ink-300">{acct.accountEmail || acct.accountLabel || `Account ${acct.id.slice(-6)}`}</div>
                        {acct.providerId === 'codex' && !acct.accountEmail && <div className="text-[10px] text-aurora-amber">email not detected yet; run Refresh or reconnect with email/profile scope</div>}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] ${acct.isDefault ? 'border-aurora-mint/40 bg-aurora-mint/10 text-aurora-mint' : 'border-white/15 bg-white/5 text-ink-300'}`}>
                          {acct.isDefault ? 'default' : 'connected'}
                        </span>
                        {statusBadge(acct.statusDetail, acct.quotaStatus)}
                      </div>
                    </div>
                    <code className="mt-2 block text-xs text-ink-200">{acct.maskedAccessToken || 'stored server-side'}</code>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <Mini label="Plan" value={acct.planName || 'Not detected yet'} />
                      <Mini label="Quota" value={`${acct.statusDetail?.label || acct.quotaStatus || 'needs check'} · ${acct.statusDetail?.confidence || acct.quotaConfidence || 'unknown'}`} />
                      <Mini label="Reset" value={acct.quotaResetCadence ? `${acct.quotaResetCadence}${acct.quotaNextResetAt ? `, ${new Date(acct.quotaNextResetAt).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, month: 'short', day: 'numeric' })}` : ''}` : 'needs check'} />
                      <Mini label="Health" value={acct.lastHealthCheckedAt ? `${acct.lastHealthOk ? 'ok' : 'failed'} (${acct.lastHealthStatus || 0})` : 'not checked'} />
                    </div>
                    <ObservedUsage windows={acct.quotaWindows || []} />
                    {acct.statusDetail?.action && <div className="mt-2 rounded-xl border border-aurora-amber/25 bg-aurora-amber/10 px-2 py-1 text-xs text-aurora-amber">{acct.statusDetail.action}</div>}
                    {acct.lastHealthError && <div className="mt-2 rounded-xl border border-aurora-rose/25 bg-aurora-rose/10 px-2 py-1 text-xs text-aurora-rose">{acct.lastHealthError}</div>}
                    <div className="mt-2 text-xs text-ink-300">scope: {acct.scope || '-'}</div>
                    <div className="text-xs text-ink-300">expires: {acct.expiresAt ? new Date(acct.expiresAt).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, month: 'short', day: 'numeric', year: 'numeric' }) : 'refresh token'}</div>
                    <div className="text-xs text-ink-300">last used: {acct.lastUsedAt ? relativeTime(acct.lastUsedAt) : 'never'}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button onClick={() => testProviderAccount(acct)} className="btn-ghost px-3 py-1 text-xs">Test OAuth</button>
                      {acct.providerId === 'kiro' && <button onClick={() => repairKiroAccount(acct)} className="btn-ghost px-3 py-1 text-xs">Repair from browser/cache</button>}
                      {!acct.isDefault && <button onClick={() => setDefaultProviderAccount(acct)} className="btn-ghost px-3 py-1 text-xs">Set default</button>}
                      <button onClick={() => deleteProviderAccount(acct)} className="btn-danger px-3 py-1 text-xs">Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          {apps.length === 0 ? (
            <Empty icon="Crown" title="No apps connected yet" description="Internal Connected apps are separate from provider account tokens. They issue blat_ tokens for external apps that call Nyth." />
          ) : (
            <div className="space-y-3">
          {apps.map((app) => {
            const open = openApp === app.id;
            return (
              <div key={app.id} className="panel">
                <button
                  className="flex w-full items-center justify-between gap-3 p-5 text-left"
                  onClick={() => {
                    if (open) setOpenApp(null);
                    else { setOpenApp(app.id); loadTokens(app.id); }
                  }}
                >
                  <div>
                    <div className="font-display text-lg font-semibold text-ink-50">{app.name}</div>
                    <div className="text-xs text-ink-300">{app.description || 'No description'}, last used {app.lastUsedAt ? relativeTime(app.lastUsedAt) : 'never'}</div>
                    <code className="mt-1 block text-xs text-ink-300">{app.clientId}</code>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`pill text-[10px] ${app.status === 'active' ? 'border-aurora-mint/40 bg-aurora-mint/10 text-aurora-mint' : 'border-aurora-rose/40 bg-aurora-rose/10 text-aurora-rose'}`}>
                      {app.status}
                    </span>
                    <Icons.ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
                  </div>
                </button>
                {open && (
                  <div className="border-t border-white/10 px-5 py-4">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="text-[10px] uppercase tracking-wider text-ink-300">Quota policy</div>
                        <div className="mt-1 text-sm font-semibold text-ink-100">Default shared pool</div>
                        <p className="mt-1 text-xs text-ink-300">Per-app quota controls can be added here without exposing provider keys.</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="text-[10px] uppercase tracking-wider text-ink-300">Allowed models</div>
                        <div className="mt-1 text-sm font-semibold text-ink-100">Route policy</div>
                        <p className="mt-1 text-xs text-ink-300">Use routes/API key policy to restrict models for this app.</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="text-[10px] uppercase tracking-wider text-ink-300">Callback</div>
                        <code className="mt-1 block break-all text-xs text-ink-100">{(app.redirectUris || [])[0] || 'Not configured'}</code>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button onClick={() => rotate(app.id)} className="btn-ghost text-xs">
                        <Icons.RefreshCcw className="h-3 w-3" /> Rotate secret
                      </button>
                      <button onClick={() => deleteApp(app.id)} className="btn-danger text-xs">
                        <Icons.Trash2 className="h-3 w-3" /> Delete app
                      </button>
                    </div>
                    <h4 className="mt-4 text-xs font-semibold uppercase tracking-wider text-ink-300">Access tokens</h4>
                    <ul className="mt-2 space-y-2 text-sm">
                      {(tokens[app.id] || []).length === 0 ? (
                        <li className="text-xs text-ink-300">No tokens issued yet.</li>
                      ) : (
                        (tokens[app.id] || []).map((t) => (
                          <li key={t.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                            <div>
                              <code className="text-xs text-ink-100">{t.tokenPrefix}...</code>
                              <div className="text-xs text-ink-300">scopes: {(t.scopes || []).join(', ') || '-'}</div>
                              <div className="text-xs text-ink-300">last used: {t.lastUsedAt ? relativeTime(t.lastUsedAt) : 'never'}</div>
                            </div>
                            <button onClick={() => revokeToken(t.id, app.id)} className="text-xs text-aurora-rose hover:text-aurora-pink">Revoke</button>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
            </div>
          )}
        </div>
      )}
    </Page>
  );
}
