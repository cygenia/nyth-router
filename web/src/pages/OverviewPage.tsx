import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Page } from '../components/Page';
import { Stat } from '../components/Stat';
import { Skeleton } from '../components/Skeleton';
import { Dropdown } from '../components/Dropdown';
import { NythLogo } from '../components/NythLogo';
import { Icons } from '../lib/icons';
import { api } from '../lib/api';
import { formatCost, formatLatency, formatNumber, relativeTime } from '../lib/format';

const TRAFFIC_RANGES = [
  { label: '24 hours', days: 1 },
  { label: '7 days', days: 7 },
  { label: '14 days', days: 14 },
  { label: '30 days', days: 30 },
];

export default function OverviewPage() {
  const [overview, setOverview] = useState<any>(null);
  const [daily, setDaily] = useState<any[]>([]);
  const [insights, setInsights] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [fallbacks, setFallbacks] = useState<any[]>([]);
  const [center, setCenter] = useState<any>(null);
  const [trafficDays, setTrafficDays] = useState(14);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!overview && !center) setLoading(true);
      const results = await Promise.allSettled([
        api<any>('/api/usage/overview'),
        api<any>(`/api/usage/daily?days=${trafficDays}`),
        api<any>('/api/usage/insights'),
        api<any>('/api/providers'),
        api<any>('/api/routes'),
        api<any>('/api/usage/fallbacks?limit=10'),
        api<any>('/api/system/management-center'),
      ]);
      if (cancelled) return;

      const [ov, dy, ins, pv, rt, fb, mc] = results;
      if (ov.status === 'fulfilled') setOverview(ov.value.overview);
      if (dy.status === 'fulfilled') setDaily(dy.value.daily);
      if (ins.status === 'fulfilled') setInsights(ins.value.insights || []);
      if (pv.status === 'fulfilled') setProviders(pv.value.providers || []);
      if (rt.status === 'fulfilled') setRoutes(rt.value.routes || []);
      if (fb.status === 'fulfilled') setFallbacks(fb.value.fallbacks || []);
      if (mc.status === 'fulfilled') setCenter(mc.value);

      const failures = results.filter((item) => item.status === 'rejected') as PromiseRejectedResult[];
      setLoadError(failures.length ? failures.map((item) => item.reason?.message || String(item.reason)).join('; ') : null);
      setLoading(false);
    }
    load();
    const id = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, [trafficDays]);

  const enabledProviders = providers.filter((p) => p.enabled).length;
  const implementedProviders = providers.filter((p) => p.status === 'implemented').length;
  const connectedModels = (center?.modelProviders || []).flatMap((provider: any) =>
    (provider.sampleModels || []).map((model: any) => ({
      id: `${provider.id}-${model.id}`,
      provider: provider.name,
      name: model.displayName || model.id,
    }))
  ).slice(0, 12);

  return (
    <Page
      title="Overview"
      description="A simple view of what is running, what it costs, and what needs attention."
    >
      <section className="panel overflow-hidden p-5">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.3em] text-aurora-mint">Management center</p>
          <p className="mt-2 text-sm text-ink-300">
            Your connected models refresh after you add an account or key.
          </p>
        </div>
        {loadError && (
          <div className="mt-4 rounded-2xl border border-aurora-rose/30 bg-aurora-rose/10 px-4 py-3 text-sm text-aurora-rose">
            Could not refresh this view: {loadError}. Sign in again if this says auth_required.
          </div>
        )}

        <div className="gateway-map mt-5 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
          <div className="grid min-h-[330px] gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.75fr)] lg:items-center">
            <div className="gateway-node mx-auto flex h-52 w-52 items-center justify-center">
              <div className="orbital-gateway" aria-label="Nyth gateway orbital routing visualization">
                <div className="orbital-core">
                  <NythLogo size="sm" className="scale-75" />
                </div>
                <span className="orbital-ring orbital-ring-one" />
                <span className="orbital-ring orbital-ring-two" />
                <span className="orbital-ring orbital-ring-three" />
              </div>
            </div>
            <div className="connected-models-panel rounded-3xl border border-white/10 bg-ink-950/45 p-4 backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.28em] text-aurora-mint">Connected models</p>
                  <p className="mt-1 text-xs text-ink-300">Models ready to use from your connected accounts.</p>
                </div>
                <span className="pill-aurora text-[10px]">{center?.availableModels ?? connectedModels.length}</span>
              </div>
              {connectedModels.length === 0 ? (
                <p className="mt-4 text-sm text-ink-300">No models connected yet.</p>
              ) : (
                <div className="mt-4 max-h-52 space-y-2 overflow-y-auto pr-1">
                  {connectedModels.map((model: any) => (
                    <div key={model.id} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                      <div className="truncate text-sm font-medium text-ink-50">{model.name}</div>
                      <div className="truncate text-[10px] uppercase tracking-wider text-ink-400">{model.provider}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 text-xs text-ink-300"><span className="text-aurora-mint">Watching for updates:</span> {center?.updates?.message || 'Keeping model lists fresh.'}</div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {loading || !overview ? <Skeleton rows={4} height={120} /> : (
          <>
            <Stat
              icon="Activity"
              accent="violet"
              label="Requests (24h)"
              value={formatNumber(overview.last24h.requests)}
              hint={`${formatNumber(overview.totals.requests)} all-time`}
            />
            <Stat
              icon="LineChart"
              accent="sky"
              label="Tokens (24h)"
              value={formatNumber((overview.last24h.inputTokens || 0) + (overview.last24h.outputTokens || 0))}
              hint={`${formatNumber(overview.last24h.inputTokens)} in, ${formatNumber(overview.last24h.outputTokens)} out`}
            />
            <Stat
              icon="Sparkles"
              accent="mint"
              label="Estimated cost (24h)"
              value={formatCost(overview.last24h.estimatedCost, overview.last24h.costIncomplete)}
              hint={`${formatCost(overview.totals.estimatedCost, overview.totals.costIncomplete)} all-time`}
            />
            <Stat
              icon="Gauge"
              accent="rose"
              label="Latency p95"
              value={formatLatency(overview.last24h.p95LatencyMs)}
              hint={`avg ${formatLatency(overview.last24h.avgLatencyMs)}, p99 ${formatLatency(overview.last24h.p99LatencyMs)}`}
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="panel col-span-1 overflow-hidden p-5 lg:col-span-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-lg font-semibold text-ink-50">Traffic</h3>
              <p className="text-xs text-ink-300">Work handled across your connected providers.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-300">
<Dropdown
value={String(trafficDays)}
onChange={(value) => setTrafficDays(Number(value))}
options={TRAFFIC_RANGES.map((range) => ({ value: String(range. days), label: `Last ${range.label}` }))}
className="w-36"
buttonClassName="!rounded-full !bg-white/5 !px-3 !py-1.5 !text-xs !text-ink-100 hover:!bg-white/10"
menuAlign="right"
/>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-aurora-violet" />requests</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-aurora-mint" />tokens</span>
            </div>
          </div>
          <div className="mt-4 h-64">
            {loading ? (
              <Skeleton rows={1} height={240} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={daily} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="reqGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#bca5ff" stopOpacity={0.7} />
                      <stop offset="100%" stopColor="#bca5ff" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="tokGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#9ce4c5" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="#9ce4c5" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="day" stroke="#7682a6" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis stroke="#7682a6" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(11,13,29,0.95)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 14,
                    }}
                    labelStyle={{ color: '#fff' }}
                  />
                  <Area type="monotone" dataKey="requests" stroke="#bca5ff" fill="url(#reqGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="inputTokens" stroke="#9ce4c5" fill="url(#tokGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="panel p-5"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-lg font-semibold text-ink-50">Providers</h3>
              <p className="text-xs text-ink-300">Connection status</p>
            </div>
            <span className="pill-aurora"><Icons.Plug className="h-3 w-3" /> {providers.length}</span>
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            <li className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
              <span className="text-ink-200">Enabled</span>
              <span className="font-display font-semibold text-aurora-mint">{enabledProviders}</span>
            </li>
            <li className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
              <span className="text-ink-200">Ready connectors</span>
              <span className="font-display font-semibold text-aurora-violet">{implementedProviders}</span>
            </li>
            <li className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
              <span className="text-ink-200">Saved paths</span>
              <span className="font-display font-semibold text-aurora-sky">
                {overview?.routesActive ?? routes.length}
              </span>
            </li>
            <li className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
              <span className="text-ink-200">Switches (24h)</span>
              <span className="font-display font-semibold text-aurora-rose">
                {overview?.fallbackEvents24h ?? 0}
              </span>
            </li>
          </ul>
        </motion.section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="panel p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-ink-50">Recent switches</h3>
            <Icons.RefreshCcw className="h-4 w-4 text-ink-300" />
          </div>
          {fallbacks.length === 0 ? (
            <p className="mt-4 text-sm text-ink-300">No switches in the last 24h. Things are smooth ✨</p>
          ) : (
            <ul className="mt-4 space-y-2 text-sm">
              {fallbacks.map((f) => (
                <li key={f.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                  <div>
                    <div className="text-ink-100">
                      <span className="text-aurora-rose">{f.fromProvider}</span><span>{' to '}</span>
                      <span className="text-aurora-mint">{f.toProvider}</span>
                    </div>
                    <div className="text-xs text-ink-300">{f.reason}</div>
                  </div>
                  <div className="text-xs text-ink-300">{relativeTime(f.ts)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-ink-50">Insights</h3>
            <Icons.Lightbulb className="h-4 w-4 text-aurora-peach" />
          </div>
          {insights.length === 0 ? (
            <p className="mt-4 text-sm text-ink-300">
              Once there is enough activity, useful suggestions will appear here.
            </p>
          ) : (
            <ul className="mt-4 space-y-3 text-sm">
              {insights.map((insight) => (
                <li key={insight.kind} className={`rounded-2xl border px-3 py-3 ${
                  insight.severity === 'warn'
                    ? 'border-aurora-rose/30 bg-aurora-rose/10'
                    : 'border-aurora-violet/30 bg-aurora-violet/10'
                }`}>
                  <div className="font-medium text-ink-50">{insight.title}</div>
                  <div className="text-xs text-ink-300">{insight.detail}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Page>
  );
}
