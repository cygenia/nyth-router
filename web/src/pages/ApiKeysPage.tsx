import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Page } from '../components/Page';
import { Skeleton } from '../components/Skeleton';
import { Modal } from '../components/Modal';
import { Empty } from '../components/Empty';
import { Icons } from '../lib/icons';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { copyToClipboard, relativeTime } from '../lib/format';

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState({ label: '', customKey: '', rateLimitPerMin: 0, allowedModels: '', allowedRoutes: '' });
  const [revealed, setRevealed] = useState<{ key: string; id: string } | null>(null);
  const toast = useToast();

  async function load() {
    setLoading(true);
    try {
      const data = await api<any>('/api/oauth/unified-keys');
      setKeys(data.keys || []);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const created = await api<any>('/api/oauth/unified-keys', {
      method: 'POST',
      body: JSON.stringify({
        label: draft.label || draft.customKey || 'Unified key',
        customKey: draft.customKey || undefined,
        rateLimitPerMin: Number(draft.rateLimitPerMin) || null,
        allowedRoutes: draft.allowedRoutes ? draft.allowedRoutes.split(',').map((s) => s.trim()).filter(Boolean) : [],
        allowedModels: draft.allowedModels ? draft.allowedModels.split(',').map((s) => s.trim()).filter(Boolean) : [],
      }),
    });
    setRevealed({ key: created.key.key, id: created.key.id });
    setShowNew(false);
    setDraft({ label: '', customKey: '', rateLimitPerMin: 0, allowedModels: '', allowedRoutes: '' });
    toast.push('Unified API key created. Copy it now. It will not be shown again.', 'success');
    load();
  }

  async function rotate(id: string) {
    if (!confirm('Rotate this key? Existing apps using it will need to update.')) return;
    const data = await api<any>(`/api/oauth/unified-keys/${id}/rotate`, { method: 'POST' });
    setRevealed({ key: data.key.key, id: data.key.id });
    toast.push('Key rotated. Update your apps with the new value.', 'success');
    load();
  }

  async function copyExisting(id: string) {
    const data = await api<any>(`/api/oauth/unified-keys/${id}/reveal`, { method: 'POST' });
    await copyToClipboard(data.key.key);
    toast.push('Key copied to clipboard.', 'success');
  }

  async function revoke(id: string) {
    if (!confirm('Revoke this key? Requests using it will be rejected.')) return;
    await api(`/api/oauth/unified-keys/${id}/revoke`, { method: 'POST' });
    toast.push('Key revoked.', 'success');
    load();
  }

  async function remove(id: string) {
    if (!confirm('Permanently delete this key?')) return;
    await api(`/api/oauth/unified-keys/${id}`, { method: 'DELETE' });
    toast.push('Key deleted.', 'success');
    load();
  }

  return (
    <Page
      title="API keys"
      description="Nyth gives you one unified key per workspace. External apps use it on /v1/chat/completions and Nyth routes to providers."
      actions={
        <button onClick={() => setShowNew(true)} className="btn-primary">
          <Icons.Plus className="h-3.5 w-3.5" /> New key
        </button>
      }
    >
      <section className="panel relative overflow-hidden p-5">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-aurora-violet/15 via-transparent to-aurora-mint/15" />
        <div className="relative">
          <h3 className="font-display text-lg font-semibold text-ink-50">How to use</h3>
          <p className="mt-1 text-sm text-ink-200">
            Use one Nyth key and let your saved paths do the rest.
          </p>
          <pre className="mt-3 overflow-x-auto pretty-scroll rounded-2xl border border-white/10 bg-ink-900/70 p-3 text-xs text-ink-100">
{`curl http://localhost:9879/v1/chat/completions \\
  -H "Authorization: Bearer bl_..." \\
  -H "Content-Type: application/json" \\
  --data '{
    "model": "nyth-smart",
    "messages": [{ "role": "user", "content": "Hello!" }]
  }'`}
          </pre>
        </div>
      </section>

      {loading ? (
        <Skeleton rows={3} height={80} />
      ) : keys.length === 0 ? (
        <Empty
          icon="KeyRound"
          title="No unified keys yet"
          description="Create one to authenticate external apps. Provider keys stay safe in your local vault."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {keys.map((k) => (
            <motion.div
              key={k.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="panel p-5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-display text-lg font-semibold text-ink-50">{k.label}</div>
                  <code className="text-xs text-ink-300">{k.maskedKey || `${k.keyPrefix}...••••`}</code>
                </div>
                <span className={`pill text-[10px] ${k.enabled ? 'border-aurora-mint/40 bg-aurora-mint/10 text-aurora-mint' : 'border-aurora-rose/40 bg-aurora-rose/10 text-aurora-rose'}`}>
                  {k.enabled ? 'enabled' : 'revoked'}
                </span>
              </div>
              <ul className="mt-3 space-y-1 text-xs text-ink-300">
                <li>Rate limit: {k.rateLimitPerMin ? `${k.rateLimitPerMin}/min` : 'unlimited'}</li>
                <li>Allowed routes: {k.allowedRoutes?.length ? k.allowedRoutes.join(', ') : 'all'}</li>
                <li>Allowed models: {k.allowedModels?.length ? k.allowedModels.join(', ') : 'all'}</li>
                <li>Last used: {k.lastUsedAt ? relativeTime(k.lastUsedAt) : '-'}</li>
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => copyExisting(k.id)} className="btn-ghost text-xs">
                  <Icons.Copy className="h-3 w-3" /> Copy
                </button>
                <button onClick={() => rotate(k.id)} className="btn-ghost text-xs">
                  <Icons.RefreshCcw className="h-3 w-3" /> Rotate
                </button>
                {k.enabled ? (
                  <button onClick={() => revoke(k.id)} className="btn-ghost text-xs">
                    <Icons.Power className="h-3 w-3" /> Revoke
                  </button>
                ) : null}
                <button onClick={() => remove(k.id)} className="btn-danger text-xs">
                  <Icons.Trash2 className="h-3 w-3" /> Delete
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Modal
        open={showNew}
        onClose={() => setShowNew(false)}
        title="Create unified API key"
        description="One key per app/integration is recommended."
        footer={
          <>
            <button onClick={() => setShowNew(false)} className="btn-ghost">Cancel</button>
            <button form="new-unified-key" type="submit" className="btn-primary"><Icons.KeyRound className="h-3.5 w-3.5" /> Create</button>
          </>
        }
      >
        <form id="new-unified-key" onSubmit={create} className="space-y-3 text-sm">
          <div>
            <label className="field-label">Label</label>
            <input className="field-input mt-1" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Defaults to the API key value" />
          </div>
          <div>
            <label className="field-label">API key value (optional)</label>
            <input className="field-input mt-1 font-mono" value={draft.customKey} onChange={(e) => setDraft({ ...draft, customKey: e.target.value })} placeholder="Leave blank to auto-generate, or paste your own key" />
          </div>
          <div>
            <label className="field-label">Rate limit (req / min, 0 = unlimited)</label>
            <input type="number" className="field-input mt-1" value={draft.rateLimitPerMin} onChange={(e) => setDraft({ ...draft, rateLimitPerMin: Number(e.target.value || 0) })} />
          </div>
          <div>
            <label className="field-label">Allowed routes (comma list, blank = all)</label>
            <input className="field-input mt-1 font-mono" value={draft.allowedRoutes} onChange={(e) => setDraft({ ...draft, allowedRoutes: e.target.value })} placeholder="nyth-smart, nyth-cheap" />
          </div>
          <div>
            <label className="field-label">Allowed models (comma list, blank = all)</label>
            <input className="field-input mt-1 font-mono" value={draft.allowedModels} onChange={(e) => setDraft({ ...draft, allowedModels: e.target.value })} placeholder="openai/gpt-5.5, anthropic/claude-opus-4.7" />
          </div>
        </form>
      </Modal>

      <Modal
        open={!!revealed}
        onClose={() => setRevealed(null)}
        title="Copy your new key"
        description="This is the only time the full key is shown."
        footer={
          <button
            onClick={() => {
              if (revealed) copyToClipboard(revealed.key);
              toast.push('Key copied to clipboard.', 'success');
            }}
            className="btn-primary"
          >
            <Icons.Copy className="h-3.5 w-3.5" /> Copy key
          </button>
        }
      >
        <code className="block break-all rounded-2xl border border-aurora-mint/40 bg-aurora-mint/10 px-4 py-3 font-mono text-sm text-aurora-mint">
          {revealed?.key}
        </code>
      </Modal>
    </Page>
  );
}
