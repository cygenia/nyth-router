import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Page } from '../components/Page';
import { Skeleton } from '../components/Skeleton';
import { Icons } from '../lib/icons';
import { api } from '../lib/api';

const CATEGORY_LABELS: Record<string, string> = {
  cloud: 'Cloud',
  aggregator: 'Aggregator',
  serverless: 'Serverless',
  local: 'Local',
  image: 'Image',
  embeddings: 'Embeddings',
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
        p.format.toLowerCase().includes(s)
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

  return (
    <Page
      title="Providers"
      description="Browse the registry of 100+ providers and models. Add your API keys to start routing real traffic."
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
            placeholder="Search providers, formats, models…"
            className="flex-1 bg-transparent text-ink-50 placeholder:text-ink-300/70 outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-xl border border-white/10 bg-ink-900/60 px-3 py-2 text-xs text-ink-100">
            {categories.map((c) => (
              <option key={c} value={c} className="bg-ink-950">{c === 'all' ? 'All categories' : CATEGORY_LABELS[c] || c}</option>
            ))}
          </select>
          <select value={capability} onChange={(e) => setCapability(e.target.value)} className="rounded-xl border border-white/10 bg-ink-900/60 px-3 py-2 text-xs text-ink-100">
            {capabilities.map((c) => (
              <option key={c} value={c} className="bg-ink-950">{c === 'all' ? 'All capabilities' : c}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-xl border border-white/10 bg-ink-900/60 px-3 py-2 text-xs text-ink-100">
            <option value="all" className="bg-ink-950">All status</option>
            <option value="implemented" className="bg-ink-950">Live adapter</option>
            <option value="metadata-only" className="bg-ink-950">Metadata only</option>
            <option value="planned" className="bg-ink-950">Planned</option>
          </select>
        </div>
      </div>

      {loading ? (
        <Skeleton rows={4} height={120} />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              whileHover={{ y: -3 }}
              className="panel relative flex flex-col gap-3 p-4"
            >
              <div className="flex items-start gap-3">
                <ProviderAvatar id={p.id} />
                <div className="flex-1">
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
                    <span>·</span>
                    <span className="font-mono">{p.format}</span>
                    {p.docsUrl && (
                      <>
                        <span>·</span>
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
              <div className="flex items-center justify-between text-xs text-ink-300">
                <span>{p.modelCount} models · {p.keyCount} key{p.keyCount === 1 ? '' : 's'}</span>
                <Link to={`/providers/${p.id}`} className="text-aurora-mint hover:text-aurora-pink">manage →</Link>
              </div>
            </motion.div>
          ))}
        </div>
      )}
      {!loading && filtered.length === 0 && (
        <div className="panel p-8 text-center text-ink-300">No providers match your filters.</div>
      )}
    </Page>
  );
}

function ProviderAvatar({ id }: { id: string }) {
  const seed = id.charCodeAt(0) + (id.charCodeAt(1) || 0);
  const hue = seed * 47 % 360;
  return (
    <div
      className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/10 text-sm font-display font-semibold text-ink-950"
      style={{
        background: `linear-gradient(135deg, hsl(${hue}, 80%, 78%), hsl(${(hue + 80) % 360}, 75%, 70%))`,
      }}
    >
      {id.slice(0, 2).toUpperCase()}
    </div>
  );
}
