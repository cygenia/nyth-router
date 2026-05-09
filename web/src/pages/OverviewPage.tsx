import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Page } from '../components/Page';
import { Stat } from '../components/Stat';
import { Skeleton } from '../components/Skeleton';
import { Icons } from '../lib/icons';
import { api } from '../lib/api';
import { formatCurrency, formatLatency, formatNumber, relativeTime } from '../lib/format';

export default function OverviewPage() {
  const [overview, setOverview] = useState<any>(null);
  const [daily, setDaily] = useState<any[]>([]);
  const [insights, setInsights] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [fallbacks, setFallbacks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [ov, dy, ins, pv, rt, fb] = await Promise.all([
          api<any>('/api/usage/overview'),
          api<any>('/api/usage/daily?days=14'),
          api<any>('/api/usage/insights'),
          api<any>('/api/providers'),
          api<any>('/api/routes'),
          api<any>('/api/usage/fallbacks?limit=10'),
        ]);
        if (cancelled) return;
        setOverview(ov.overview);
        setDaily(dy.daily);
        setInsights(ins.insights || []);
        setProviders(pv.providers || []);
        setRoutes(rt.routes || []);
        setFallbacks(fb.fallbacks || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const id = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const enabledProviders = providers.filter((p) => p.enabled).length;
  const implementedProviders = providers.filter((p) => p.status === 'implemented').length;

  return (
    <Page
      title="Overview"
      description="A live snapshot of your local AI gateway — traffic, cost, latency, fallback events, and quick wins."
    >
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
              hint={`${formatNumber(overview.last24h.inputTokens)} in · ${formatNumber(overview.last24h.outputTokens)} out`}
            />
            <Stat
              icon="Sparkles"
              accent="mint"
              label="Estimated cost (24h)"
              value={formatCurrency(overview.last24h.estimatedCost)}
              hint={`${formatCurrency(overview.totals.estimatedCost)} all-time`}
            />
            <Stat
              icon="Gauge"
              accent="rose"
              label="Latency p95"
              value={formatLatency(overview.last24h.p95LatencyMs)}
              hint={`avg ${formatLatency(overview.last24h.avgLatencyMs)} · p99 ${formatLatency(overview.last24h.p99LatencyMs)}`}
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
              <h3 className="font-display text-lg font-semibold text-ink-50">Traffic, last 14 days</h3>
              <p className="text-xs text-ink-300">Requests routed through Bigliner across all providers.</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-ink-300">
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
              <p className="text-xs text-ink-300">Live registry status</p>
            </div>
            <span className="pill-aurora"><Icons.Plug className="h-3 w-3" /> {providers.length}</span>
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            <li className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
              <span className="text-ink-200">Enabled</span>
              <span className="font-display font-semibold text-aurora-mint">{enabledProviders}</span>
            </li>
            <li className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
              <span className="text-ink-200">Adapters live</span>
              <span className="font-display font-semibold text-aurora-violet">{implementedProviders}</span>
            </li>
            <li className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
              <span className="text-ink-200">Routes active</span>
              <span className="font-display font-semibold text-aurora-sky">
                {overview?.routesActive ?? routes.length}
              </span>
            </li>
            <li className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
              <span className="text-ink-200">Fallbacks (24h)</span>
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
            <h3 className="font-display text-lg font-semibold text-ink-50">Recent fallbacks</h3>
            <Icons.RefreshCcw className="h-4 w-4 text-ink-300" />
          </div>
          {fallbacks.length === 0 ? (
            <p className="mt-4 text-sm text-ink-300">No fallback events in the last 24h. Things are smooth ✨</p>
          ) : (
            <ul className="mt-4 space-y-2 text-sm">
              {fallbacks.map((f) => (
                <li key={f.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                  <div>
                    <div className="text-ink-100">
                      <span className="text-aurora-rose">{f.fromProvider}</span> →{' '}
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
              Bigliner will surface "could be cheaper" routes, slow providers, and prompt repeats here once you have traffic.
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
