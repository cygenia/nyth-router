import { useEffect, useState } from 'react';
import { Page } from '../components/Page';
import { Skeleton } from '../components/Skeleton';
import { Empty } from '../components/Empty';
import { Icons } from '../lib/icons';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { copyToClipboard, relativeTime } from '../lib/format';

export default function OAuthManagePage() {
  const [apps, setApps] = useState<any[]>([]);
  const [tokens, setTokens] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [openApp, setOpenApp] = useState<string | null>(null);
  const toast = useToast();

  async function load() {
    setLoading(true);
    try {
      const data = await api<any>('/api/oauth/apps');
      setApps(data.apps || []);
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

  return (
    <Page
      title="OAuth apps"
      description="Manage authorized apps: rotate client secrets, revoke tokens, audit usage."
    >
      {loading ? (
        <Skeleton rows={3} height={120} />
      ) : apps.length === 0 ? (
        <Empty icon="Crown" title="No apps registered" description="Use the OAuth login page to register your first local app." />
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
                    <div className="text-xs text-ink-300">{app.description || 'No description'} · last used {app.lastUsedAt ? relativeTime(app.lastUsedAt) : 'never'}</div>
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
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => rotate(app.id)} className="btn-ghost text-xs">
                        <Icons.RefreshCcw className="h-3 w-3" /> Rotate secret
                      </button>
                      <button onClick={() => deleteApp(app.id)} className="btn-danger text-xs">
                        <Icons.Trash2 className="h-3 w-3" /> Delete app
                      </button>
                    </div>
                    <h4 className="mt-4 text-xs font-semibold uppercase tracking-wider text-ink-300">Tokens</h4>
                    <ul className="mt-2 space-y-2 text-sm">
                      {(tokens[app.id] || []).length === 0 ? (
                        <li className="text-xs text-ink-300">No tokens issued yet.</li>
                      ) : (
                        (tokens[app.id] || []).map((t) => (
                          <li key={t.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                            <div>
                              <code className="text-xs text-ink-100">{t.tokenPrefix}…</code>
                              <div className="text-xs text-ink-300">scopes: {(t.scopes || []).join(', ') || '—'}</div>
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
    </Page>
  );
}
