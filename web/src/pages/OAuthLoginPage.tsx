import { useEffect, useState } from 'react';
import { Page } from '../components/Page';
import { Modal } from '../components/Modal';
import { Empty } from '../components/Empty';
import { Skeleton } from '../components/Skeleton';
import { Icons } from '../lib/icons';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { copyToClipboard, relativeTime } from '../lib/format';

const ALL_SCOPES = ['chat:read', 'chat:write', 'providers:read', 'usage:read', 'routes:use'];

export default function OAuthLoginPage() {
  const [apps, setApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState({ name: '', description: '', redirectUri: 'http://localhost:5173/callback', scopes: ['chat:read', 'chat:write'] });
  const [secrets, setSecrets] = useState<{ name: string; clientId: string; clientSecret: string } | null>(null);
  const [issueFor, setIssueFor] = useState<any>(null);
  const [issuedToken, setIssuedToken] = useState<{ appName: string; token: string } | null>(null);
  const toast = useToast();

  async function load() {
    setLoading(true);
    try {
      const data = await api<any>('/api/oauth/apps');
      setApps(data.apps || []);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function createApp(e: React.FormEvent) {
    e.preventDefault();
    const created = await api<any>('/api/oauth/apps', {
      method: 'POST',
      body: JSON.stringify({
        name: draft.name,
        description: draft.description,
        redirectUris: draft.redirectUri ? [draft.redirectUri] : [],
        scopes: draft.scopes,
      }),
    });
    setSecrets({ name: created.app.name, clientId: created.app.clientId, clientSecret: created.app.clientSecret });
    setShowNew(false);
    toast.push(`App "${created.app.name}" registered.`, 'success');
    load();
  }

  async function approve(app: any) {
    setIssueFor(null);
    const issued = await api<any>(`/api/oauth/apps/${app.id}/tokens`, {
      method: 'POST',
      body: JSON.stringify({ scopes: app.scopes, ttlSeconds: 60 * 60 * 24 * 30 }),
    });
    setIssuedToken({ appName: app.name, token: issued.token.token });
    toast.push(`Token issued for ${app.name}.`, 'success');
  }

  return (
    <Page
      title="App access"
      description="Apps connect through Nyth without seeing provider keys."
      actions={
        <button onClick={() => setShowNew(true)} className="btn-primary">
          <Icons.Plus className="h-4 w-4" /> Register app
        </button>
      }
    >
      <section className="panel p-5">
        <h3 className="font-display text-lg font-semibold text-ink-50">How app access works</h3>
        <ol className="mt-3 space-y-2 text-sm text-ink-200">
          <li><span className="text-aurora-mint">1.</span> Add your app here. Nyth creates its sign-in details.</li>
          <li><span className="text-aurora-mint">2.</span> The app asks for access — you approve it here.</li>
          <li><span className="text-aurora-mint">3.</span> Nyth gives the app a limited <code className="font-mono">blat_</code> token the app uses on <code className="font-mono">/v1/*</code>.</li>
          <li><span className="text-aurora-mint">4.</span> Manage, revoke, and rotate from the Connected apps page.</li>
        </ol>
      </section>

      {loading ? (
        <Skeleton rows={2} height={120} />
      ) : apps.length === 0 ? (
        <Empty
          icon="ShieldCheck"
          title="No apps yet"
          description="Register your first local app to issue tokens."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {apps.map((app) => (
            <div key={app.id} className="panel p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-semibold text-ink-50">{app.name}</h3>
                  <p className="text-sm text-ink-300">{app.description || 'No description'}</p>
                  <code className="mt-2 block break-all text-xs text-ink-300">{app.clientId}</code>
                </div>
                <span className={`pill text-[10px] ${app.status === 'active' ? 'border-aurora-mint/40 bg-aurora-mint/10 text-aurora-mint' : 'border-aurora-rose/40 bg-aurora-rose/10 text-aurora-rose'}`}>
                  {app.status}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1 text-[10px]">
                {(app.scopes || []).map((s: string) => (
                  <span key={s} className="pill-aurora">{s}</span>
                ))}
              </div>
              <div className="mt-3 text-xs text-ink-300">
                Last used: {app.lastUsedAt ? relativeTime(app.lastUsedAt) : 'never'}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => setIssueFor(app)} className="btn-primary text-xs">
                  <Icons.ShieldCheck className="h-3 w-3" /> Approve & issue token
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={showNew}
        onClose={() => setShowNew(false)}
        title="Register local app"
        description="Apps are local-only — redirect URIs typically point at localhost."
        footer={
          <>
            <button onClick={() => setShowNew(false)} className="btn-ghost">Cancel</button>
            <button form="new-app" type="submit" className="btn-primary"><Icons.ShieldCheck className="h-4 w-4" /> Register</button>
          </>
        }
      >
        <form id="new-app" onSubmit={createApp} className="space-y-3 text-sm">
          <div>
            <label className="field-label">App name</label>
            <input className="field-input mt-1" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
          </div>
          <div>
            <label className="field-label">Description</label>
            <input className="field-input mt-1" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </div>
          <div>
            <label className="field-label">Redirect URI (local)</label>
            <input className="field-input mt-1 font-mono" value={draft.redirectUri} onChange={(e) => setDraft({ ...draft, redirectUri: e.target.value })} />
          </div>
          <div>
            <label className="field-label">Scopes</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {ALL_SCOPES.map((s) => {
                const checked = draft.scopes.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setDraft({ ...draft, scopes: checked ? draft.scopes.filter((x) => x !== s) : [...draft.scopes, s] })}
                    className={`pill text-[10px] ${checked ? 'border-aurora-mint/40 bg-aurora-mint/15 text-aurora-mint' : ''}`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!secrets}
        onClose={() => setSecrets(null)}
        title="Save these credentials"
        description={`These are shown once for ${secrets?.name}.`}
        footer={
          <button
            onClick={() => {
              if (secrets) copyToClipboard(`client_id=${secrets.clientId}\nclient_secret=${secrets.clientSecret}`);
              toast.push('Credentials copied.', 'success');
            }}
            className="btn-primary"
          >
            <Icons.Copy className="h-4 w-4" /> Copy
          </button>
        }
      >
        <div className="space-y-3 font-mono text-xs">
          <div className="rounded-2xl border border-white/10 bg-ink-900/70 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-ink-300">client_id</div>
            <div className="break-all text-ink-100">{secrets?.clientId}</div>
          </div>
          <div className="rounded-2xl border border-aurora-violet/40 bg-aurora-violet/10 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-aurora-violet">client_secret</div>
            <div className="break-all text-aurora-violet">{secrets?.clientSecret}</div>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!issueFor}
        onClose={() => setIssueFor(null)}
        title={`Authorize "${issueFor?.name}"`}
        description="Approve this app to act on your behalf with the requested scopes."
        footer={
          <>
            <button onClick={() => setIssueFor(null)} className="btn-ghost">Deny</button>
            <button onClick={() => issueFor && approve(issueFor)} className="btn-primary">
              <Icons.ShieldCheck className="h-4 w-4" /> Approve
            </button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <p className="text-ink-200">{issueFor?.description || 'This app wants to connect to Nyth.'}</p>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="text-xs uppercase tracking-wider text-ink-300">Scopes</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {(issueFor?.scopes || []).map((s: string) => (
                <span key={s} className="pill-aurora text-[10px]">{s}</span>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!issuedToken}
        onClose={() => setIssuedToken(null)}
        title="Token issued"
        description={`Provide this to ${issuedToken?.appName} once. It cannot be retrieved later.`}
        footer={
          <button onClick={() => issuedToken && copyToClipboard(issuedToken.token)} className="btn-primary">
            <Icons.Copy className="h-4 w-4" /> Copy token
          </button>
        }
      >
        <code className="block break-all rounded-2xl border border-aurora-mint/40 bg-aurora-mint/10 px-4 py-3 font-mono text-sm text-aurora-mint">
          {issuedToken?.token}
        </code>
      </Modal>
    </Page>
  );
}
