import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Page } from '../components/Page';
import { Skeleton } from '../components/Skeleton';
import { Icons } from '../lib/icons';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { copyToClipboard, formatCurrency, relativeTime } from '../lib/format';
import { ProviderLogo } from '../lib/providerBranding';

export default function ProviderDetailPage() {
  const { id } = useParams();
  const [provider, setProvider] = useState<any>(null);
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyForm, setKeyForm] = useState({ label: '', apiKey: '', baseUrlOverride: '', defaultModel: '', priority: 100 });
  const [pingState, setPingState] = useState<null | { ok: boolean; status?: number; error?: string }>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function load() {
    setLoading(true);
    try {
      const [pv, ky] = await Promise.all([
        api<any>(`/api/providers/${id}`),
        api<any>('/api/keys'),
      ]);
      setProvider(pv.provider);
      setKeys((ky.keys || []).filter((k: any) => k.providerId === id));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (id) load(); }, [id]);

  async function addKey(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/api/keys', {
        method: 'POST',
        body: JSON.stringify({
          providerId: id,
          label: keyForm.label || 'Untitled key',
          apiKey: keyForm.apiKey,
          baseUrlOverride: keyForm.baseUrlOverride || undefined,
          defaultModel: keyForm.defaultModel || undefined,
          priority: keyForm.priority,
        }),
      });
      toast.push('Provider key saved (encrypted at rest).', 'success');
      setShowKeyModal(false);
      setKeyForm({ label: '', apiKey: '', baseUrlOverride: '', defaultModel: '', priority: 100 });
      await load();
    } catch (err: any) {
      toast.push(err?.message || 'Failed to save key', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function deleteKey(keyId: string) {
    if (!confirm('Delete this provider key? This cannot be undone.')) return;
    await api(`/api/keys/${keyId}`, { method: 'DELETE' });
    toast.push('Key removed.', 'success');
    load();
  }

  async function toggleKey(key: any) {
    await api(`/api/keys/${key.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !key.enabled }) });
    load();
  }

  async function pingProvider() {
    setPingState(null);
    setBusy(true);
    try {
      const res = await api<any>(`/api/providers/${id}/test`, { method: 'POST' });
      setPingState({ ok: res.ok, status: res.status, error: res.error });
      toast.push(res.ok ? 'Provider reachable' : 'Provider unreachable', res.ok ? 'success' : 'error');
    } finally {
      setBusy(false);
    }
  }

  if (loading || !provider) return <Page title="Provider"><Skeleton rows={4} height={80} /></Page>;

  return (
    <Page
      title={
        <span className="inline-flex items-center gap-3">
          <ProviderLogo id={provider.id} name={provider.name} size="lg" />
          <span>{provider.name}</span>
        </span>
      }
      description={`Format: ${provider.format}, Category: ${provider.category}, Status: ${provider.status}`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/providers" className="btn-ghost">
            <Icons.ChevronLeft className="h-4 w-4" /> All providers
          </Link>
          <button onClick={pingProvider} disabled={busy} className="btn-ghost">
            <Icons.Activity className="h-4 w-4" /> Test connection
          </button>
          <button onClick={() => setShowKeyModal(true)} className="btn-primary">
            <Icons.Plus className="h-4 w-4" /> Add API key
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="panel p-5 lg:col-span-2">
          <h3 className="font-display text-lg font-semibold text-ink-50">Connection</h3>
          <dl className="mt-3 grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
            <Row label="Base URL" value={<code className="break-all text-ink-100">{provider.baseUrl}</code>} />
            <Row label="Auth type" value={provider.authType} />
            <Row label="Format" value={<span className="font-mono">{provider.format}</span>} />
            <Row label="Capabilities" value={(provider.capabilities || []).join(', ') || '-'} />
            <Row label="Docs" value={provider.docsUrl ? <a href={provider.docsUrl} target="_blank" rel="noreferrer" className="text-aurora-mint">{provider.docsUrl}</a> : '-'} />
            <Row label="Notes" value={provider.notes || '-'} />
          </dl>
          {pingState && (
            <div className={`mt-4 rounded-2xl border px-3 py-3 text-sm ${
              pingState.ok ? 'border-aurora-mint/30 bg-aurora-mint/10 text-aurora-mint' : 'border-aurora-rose/30 bg-aurora-rose/10 text-aurora-rose'
            }`}>
              {pingState.ok ? `OK, status ${pingState.status}` : `Error, ${pingState.error || `status ${pingState.status}`}`}
            </div>
          )}
        </section>
        <section className="panel p-5">
          <h3 className="font-display text-lg font-semibold text-ink-50">API keys</h3>
          {keys.length === 0 ? (
            <p className="mt-2 text-sm text-ink-300">No keys configured. Add one to start routing real traffic.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {keys.map((k) => (
                <li key={k.id} className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-ink-50">{k.label}</span>
                    <span className={`pill text-[10px] ${k.enabled ? 'text-aurora-mint border-aurora-mint/40 bg-aurora-mint/10' : 'text-aurora-rose border-aurora-rose/40 bg-aurora-rose/10'}`}>
                      {k.enabled ? 'enabled' : 'disabled'}
                    </span>
                  </div>
                  <code className="font-mono text-xs text-ink-200">{k.maskedKey}</code>
                  <div className="flex flex-wrap gap-2 text-xs text-ink-300">
                    <span>priority {k.priority}</span>
                    {k.lastUsedAt && <span>used {relativeTime(k.lastUsedAt)}</span>}
                    {k.lastError && <span className="text-aurora-rose">err: {k.lastError}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => toggleKey(k)} className="text-xs text-ink-200 hover:text-aurora-mint">
                      {k.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button onClick={() => deleteKey(k.id)} className="text-xs text-aurora-rose hover:text-aurora-pink">
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="panel overflow-hidden p-5">
        <h3 className="font-display text-lg font-semibold text-ink-50">Models</h3>
        <p className="text-xs text-ink-300">{provider.models.length} models in registry</p>
        <div className="mt-3 overflow-x-auto pretty-scroll">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-ink-300">
              <tr>
                <th className="px-3 py-2">Model</th>
                <th className="px-3 py-2">Context</th>
                <th className="px-3 py-2">In / Out price (per 1K)</th>
                <th className="px-3 py-2">Capabilities</th>
                <th className="px-3 py-2">Tags</th>
                <th className="px-3 py-2 text-right">Copy alias</th>
              </tr>
            </thead>
            <tbody>
              {provider.models.map((m: any) => (
                <tr key={m.id} className="border-t border-white/5 hover:bg-white/[0.04]">
                  <td className="px-3 py-2">
                    <div className="font-medium text-ink-50">{m.displayName}</div>
                    <div className="font-mono text-xs text-ink-300">{m.id}</div>
                    <div className="mt-1 font-mono text-[10px] text-aurora-mint">canonical: {provider.id}/{m.id}</div>
                  </td>
                  <td className="px-3 py-2 text-ink-200">{m.contextLength?.toLocaleString() || '-'}</td>
                  <td className="px-3 py-2 text-ink-200">
                    {m.inputPrice == null ? '-' : `${formatCurrency(m.inputPrice)} / ${formatCurrency(m.outputPrice)}`}
                  </td>
                  <td className="px-3 py-2 text-ink-200">{(m.capabilities || []).join(', ') || '-'}</td>
                  <td className="px-3 py-2 text-ink-200 text-xs">{(m.tags || []).join(', ')}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      className="text-xs text-aurora-mint hover:text-aurora-pink"
                      onClick={() => {
                        copyToClipboard(`${provider.id}/${m.id}`);
                        toast.push(`Copied ${provider.id}/${m.id}`, 'success');
                      }}
                    >
                      <Icons.Copy className="inline-block h-3 w-3" /> {provider.id}/{m.id}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        open={showKeyModal}
        onClose={() => setShowKeyModal(false)}
        title="Add provider key"
        description="Stored encrypted on this machine. Nyth only ever shows a masked preview after save."
        size="md"
        footer={
          <>
            <button onClick={() => setShowKeyModal(false)} className="btn-ghost">Cancel</button>
            <button form="add-key-form" type="submit" disabled={busy} className="btn-primary">
              {busy ? <Icons.Loader2 className="h-4 w-4 animate-spin" /> : <Icons.KeyRound className="h-4 w-4" />}
              Save key
            </button>
          </>
        }
      >
        <form id="add-key-form" onSubmit={addKey} className="space-y-3 text-sm">
          <div>
            <label className="field-label">Label</label>
            <input className="field-input mt-1" value={keyForm.label} onChange={(e) => setKeyForm({ ...keyForm, label: e.target.value })} placeholder="e.g. Personal" />
          </div>
          <div>
            <label className="field-label">API key</label>
            <input className="field-input mt-1 font-mono" value={keyForm.apiKey} onChange={(e) => setKeyForm({ ...keyForm, apiKey: e.target.value })} placeholder="sk-... / sk-ant-... / etc" required type="password" />
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="field-label">Base URL override</label>
              <input className="field-input mt-1" value={keyForm.baseUrlOverride} onChange={(e) => setKeyForm({ ...keyForm, baseUrlOverride: e.target.value })} placeholder="leave blank for default" />
            </div>
            <div>
              <label className="field-label">Default model</label>
              <input className="field-input mt-1 font-mono" value={keyForm.defaultModel} onChange={(e) => setKeyForm({ ...keyForm, defaultModel: e.target.value })} placeholder="optional" />
            </div>
          </div>
          <div>
            <label className="field-label">Priority (lower = preferred)</label>
            <input
              type="number"
              className="field-input mt-1"
              value={keyForm.priority}
              onChange={(e) => setKeyForm({ ...keyForm, priority: Number(e.target.value || 100) })}
            />
          </div>
        </form>
      </Modal>
    </Page>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-2">
      <span className="field-label text-[10px]">{label}</span>
      <span className="text-ink-100">{value}</span>
    </div>
  );
}
