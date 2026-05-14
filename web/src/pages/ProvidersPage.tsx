import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Page } from '../components/Page';
import { Skeleton } from '../components/Skeleton';
import { Icons } from '../lib/icons';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import { ProviderLogo } from '../lib/providerBranding';
import { Dropdown } from '../components/Dropdown';

const CATEGORY_LABELS: Record<string, string> = {
  cloud: 'Cloud',
  aggregator: 'Agregator',
  serverless: 'Serverless',
  local: 'Lokal',
  image: 'Gambar',
  embeddings: 'Embedding',
  audio: 'Audio',
  custom: 'Custom',
};

const CAPABILITY_BADGES: Record<string, string> = {
  chat: 'border-aurora-violet/40 bg-aurora-violet/10 text-aurora-violet',
  completion: 'border-aurora-violet/40 bg-aurora-violet/10 text-aurora-violet',
  embeddings: 'border-aurora-sky/40 bg-aurora-sky/10 text-aurora-sky',
  image: 'border-aurora-rose/40 bg-aurora-rose/10 text-aurora-rose',
  vision: 'border-aurora-rose/40 bg-aurora-rose/10 text-aurora-rose',
  audio: 'border-aurora-peach/40 bg-aurora-peach/10 text-aurora-peach',
  rerank: 'border-aurora-mint/40 bg-aurora-mint/10 text-aurora-mint',
  tools: 'border-aurora-mint/40 bg-aurora-mint/10 text-aurora-mint',
  streaming: 'border-white/20 bg-white/5 text-ink-100',
};

export default function ProvidersPage() {
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [capability, setCapability] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; status?: number; error?: string; checkedAt: number }>>({});
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await api<any>('/api/providers');
        if (!cancelled) setProviders(data.providers || []);
      } finally { if (!cancelled) setLoading(false); }
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return providers.filter((p) => {
      if (category !== 'all' && p.category !== category) return false;
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (capability !== 'all' && !(p.capabilities || []).includes(capability)) return false;
      if (!s) return true;
      return (
        p.name.toLowerCase().includes(s) ||
        p.id.toLowerCase().includes(s) ||
        p.format.toLowerCase().includes(s) ||
        (p.models || []).some((m: any) => `${m.displayName || m.display || ''} ${m.id || ''}`.toLowerCase().includes(s))
      );
    });
  }, [providers, search, category, capability, statusFilter]);

  const counts = useMemo(() => {
    const total = providers.length;
    const withKeys = providers.filter((p) => p.keyCount > 0).length;
    const live = providers.filter((p) => p.status === 'implemented').length;
    return { total, withKeys, live };
  }, [providers]);

  const categories = ['all', ...new Set(providers.map((p) => p.category))];
  const capabilities = ['all', ...new Set(providers.flatMap((p) => p.capabilities || []))];

  async function testProvider(providerId: string) {
    setTestingProvider(providerId);
    try {
      const res = await api<any>(`/api/providers/${providerId}/test`, { method: 'POST' });
      setTestResults((prev) => ({ ...prev, [providerId]: { ok: res.ok, status: res.status, error: res.error, checkedAt: Date.now() } }));
      toast.push(res.ok ? 'Provider API reachable' : `Provider API failed${res.status ? `, ${res.status}` : ''}`, res.ok ? 'success' : 'error');
    } catch (err: any) {
      setTestResults((prev) => ({ ...prev, [providerId]: { ok: false, error: err?.message || 'Request failed', checkedAt: Date.now() } }));
      toast.push(err?.message || 'Provider API test failed', 'error');
    } finally {
      setTestingProvider(null);
    }
  }

  return (
    <Page
      title="API Providers"
      description="Browse provider APIs and model catalogs. Add API keys or connect OAuth accounts to start routing real traffic."
      actions={
        <div className="flex items-center gap-2">
          <span className="pill"><Icons.Plug className="h-3 w-3" /> {counts.total} total</span>
          <span className="pill-mint"><Icons.ShieldCheck className="h-3 w-3" /> {counts.withKeys} keyed</span>
          <span className="pill-aurora"><Icons.Sparkles className="h-3 w-3" /> {counts.live} live adapter</span>
        </div>
      }
    >
      <div className="panel flex flex-col gap-3 p-4 md:flex-row md:items-center">
        <div className="flex flex-1 items-center gap-2 rounded-2xl border border-white/10 bg-ink-900/60 px-3 py-2">
          <Icons.Search className="h-4 w-4 text-ink-300" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search providers, formats, models..."
            className="flex-1 bg-transparent text-ink-50 placeholder:text-ink-300/70 outline-none"
          />
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3 md:w-auto">
          <Dropdown value={category} onChange={setCategory} options={categories.map((c) => ({ value: c, label: c === 'all' ? 'All categories' : CATEGORY_LABELS[c] || c }))} />
          <Dropdown value={capability} onChange={setCapability} options={capabilities.map((c) => ({ value: c, label: c === 'all' ? 'All capabilities' : c }))} />
          <Dropdown value={statusFilter} onChange={setStatusFilter} options={[
            { value: 'all', label: 'All status' },
            { value: 'implemented', label: 'Live adapter' },
            { value: 'metadata-only', label: 'Metadata only' },
            { value: 'planned', label: 'Planned' },
          ]} />
        </div>
      </div>

      {loading ? (
        <Skeleton rows={4} height={120} />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => {
            const result = testResults[p.id];
            const isTesting = testingProvider === p.id;
            return (
            <div
              key={p.id}
              className="panel relative flex flex-col gap-3 p-4 transition-transform duration-150 hover:-translate-y-0.5"
            >
              <div className="flex items-start gap-3">
                <ProviderLogo id={p.id} name={p.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link to={`/providers/${p.id}`} className="font-display text-base font-semibold text-ink-50 hover:text-aurora-mint">
                      {p.name}
                    </Link>
                    {p.status === 'implemented' && <span className="pill-mint text-[10px]">live</span>}
                    {p.status === 'metadata-only' && <span className="pill text-[10px]">metadata</span>}
                    {p.status === 'planned' && <span className="pill-aurora text-[10px]">planned</span>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-300">
                    <span>{CATEGORY_LABELS[p.category] || p.category}</span>
                    <span>,</span>
                    <span className="font-mono">{p.format}</span>
                    {p.docsUrl && (
                      <>
                        <span>,</span>
                        <a href={p.docsUrl} target="_blank" rel="noreferrer" className="hover:text-aurora-mint">docs</a>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {(p.capabilities || []).slice(0, 5).map((cap: string) => (
                  <span key={cap} className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${CAPABILITY_BADGES[cap] || 'border-white/10 bg-white/5 text-ink-200'}`}>
                    {cap}
                  </span>
                ))}
                {(p.capabilities || []).length > 5 && (
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-ink-300">+{(p.capabilities || []).length - 5}</span>
                )}
              </div>
              {result && (
                <div className={`rounded-2xl border px-3 py-2 text-xs ${result.ok ? 'border-aurora-mint/30 bg-aurora-mint/10 text-aurora-mint' : 'border-aurora-rose/30 bg-aurora-rose/10 text-aurora-rose'}`}>
                  {result.ok ? `API OK, status ${result.status || 200}` : `API failed, ${result.error || `status ${result.status || 0}`}`}
                </div>
              )}
              <div className="flex items-center justify-between gap-2 text-xs text-ink-300">
                <span>{p.modelCount} models, {p.keyCount} key{p.keyCount === 1 ? '' : 's'}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => testProvider(p.id)}
                    disabled={isTesting || p.status !== 'implemented'}
                    className="inline-flex items-center gap-1 text-aurora-sky hover:text-aurora-mint disabled:cursor-not-allowed disabled:text-ink-500"
                    title={p.status === 'implemented' ? 'Test API provider dengan key tersimpan' : 'Test API memerlukan adapter live'}
                  >
                    {isTesting ? <Icons.Loader2 className="h-3 w-3 animate-spin" /> : <Icons.Activity className="h-3 w-3" />}
                    Test API
                  </button>
                  <Link to={`/providers/${p.id}`} className="text-aurora-mint hover:text-aurora-pink">manage to</Link>
                </div>
              </div>
            </div>
          );
          })}
        </div>
      )}
      {!loading && filtered.length === 0 && (
        <div className="panel p-8 text-center text-ink-300">Tidak ada provider yang cocok dengan filter Anda.</div>
      )}
    </Page>
  );
}
