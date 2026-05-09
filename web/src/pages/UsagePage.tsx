import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Page } from '../components/Page';
import { Stat } from '../components/Stat';
import { Skeleton } from '../components/Skeleton';
import { Icons } from '../lib/icons';
import { api } from '../lib/api';
import { formatCurrency, formatNumber } from '../lib/format';

const COLORS = ['#bca5ff', '#ff8fb6', '#9ec9ff', '#9ce4c5', '#ffd2a4', '#fff4a4', '#f6a4ff'];

export default function UsagePage() {
  const [overview, setOverview] = useState<any>(null);
  const [byProvider, setByProvider] = useState<any[]>([]);
  const [byModel, setByModel] = useState<any[]>([]);
  const [byApp, setByApp] = useState<any[]>([]);
  const [insights, setInsights] = useState<any[]>([]);
  const [days, setDays] = useState(14);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [ov, pv, mo, ap, ins] = await Promise.all([
        api<any>('/api/usage/overview'),
        api<any>(`/api/usage/by-provider?days=${days}`),
        api<any>(`/api/usage/by-model?days=${days}`),
        api<any>(`/api/usage/by-app?days=${days}`),
        api<any>('/api/usage/insights'),
      ]);
      setOverview(ov.overview);
      setByProvider(pv.byProvider || []);
      setByModel(mo.byModel || []);
      setByApp(ap.byApp || []);
      setInsights(ins.insights || []);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [days]);

  const tokenSplit = useMemo(() => {
    if (!overview) return [];
    return [
      { name: 'Input', value: overview.totals.inputTokens },
      { name: 'Output', value: overview.totals.outputTokens },
    ];
  }, [overview]);

  return (
    <Page
      title="Usage"
      description="Real analytics from your gateway traffic — provider, model, and app breakdowns. Export anytime as CSV."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-xl border border-white/10 bg-ink-900/60 px-3 py-2 text-xs text-ink-100">
            {[7, 14, 30, 60].map((d) => <option key={d} value={d} className="bg-ink-950">last {d} days</option>)}
          </select>
          <a href="/api/usage/export.csv" className="btn-ghost">
            <Icons.ArrowDownToLine className="h-4 w-4" /> Export CSV
          </a>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {loading || !overview ? <Skeleton rows={4} height={120} /> : (
          <>
            <Stat icon="Activity" accent="violet" label="Requests" value={formatNumber(overview.totals.requests)} hint="all time" />
            <Stat icon="LineChart" accent="sky" label="Tokens" value={formatNumber(overview.totals.totalTokens)} hint="input + output" />
            <Stat icon="Sparkles" accent="mint" label="Estimated cost" value={formatCurrency(overview.totals.estimatedCost)} hint="all time" />
            <Stat icon="Gauge" accent="rose" label="Errors" value={formatNumber(overview.totals.errors)} hint={`${((overview.totals.errors / Math.max(1, overview.totals.requests)) * 100).toFixed(1)}% rate`} />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="panel p-5 lg:col-span-2">
          <h3 className="font-display text-lg font-semibold text-ink-50">Cost by provider</h3>
          <p className="text-xs text-ink-300">Last {days} days</p>
          <div className="mt-4 h-72">
            {loading ? <Skeleton rows={1} height={240} /> : byProvider.length === 0 ? (
              <div className="grid h-full place-items-center text-sm text-ink-300">No data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byProvider}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="providerId" stroke="#7682a6" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis stroke="#7682a6" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: 'rgba(11,13,29,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14 }}
                    formatter={(v: number) => formatCurrency(v)}
                  />
                  <Bar dataKey="estimatedCost" radius={[12, 12, 4, 4]}>
                    {byProvider.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
        <section className="panel p-5">
          <h3 className="font-display text-lg font-semibold text-ink-50">Token split</h3>
          <p className="text-xs text-ink-300">All-time input vs output</p>
          <div className="mt-4 h-72">
            {loading || !tokenSplit.length ? <Skeleton rows={1} height={240} /> : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={tokenSplit} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%">
                    {tokenSplit.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="rgba(255,255,255,0.1)" />)}
                  </Pie>
                  <Legend wrapperStyle={{ color: '#bcc4dc' }} />
                  <Tooltip
                    contentStyle={{ background: 'rgba(11,13,29,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14 }}
                    formatter={(v: number) => formatNumber(v)}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="panel p-5">
          <h3 className="font-display text-lg font-semibold text-ink-50">Top models by spend</h3>
          {byModel.length === 0 ? (
            <p className="mt-3 text-sm text-ink-300">No usage yet.</p>
          ) : (
            <div className="mt-3 overflow-x-auto pretty-scroll">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-ink-300">
                  <tr>
                    <th className="px-3 py-2">Provider</th>
                    <th className="px-3 py-2">Model</th>
                    <th className="px-3 py-2 text-right">Requests</th>
                    <th className="px-3 py-2 text-right">Tokens</th>
                    <th className="px-3 py-2 text-right">Spend</th>
                  </tr>
                </thead>
                <tbody>
                  {byModel.slice(0, 10).map((m: any) => (
                    <tr key={`${m.providerId}-${m.model}`} className="border-t border-white/5">
                      <td className="px-3 py-2 text-ink-100">{m.providerId}</td>
                      <td className="px-3 py-2 font-mono text-xs text-ink-100">{m.model}</td>
                      <td className="px-3 py-2 text-right text-ink-200">{formatNumber(m.requests)}</td>
                      <td className="px-3 py-2 text-right text-ink-200">{formatNumber((m.inputTokens || 0) + (m.outputTokens || 0))}</td>
                      <td className="px-3 py-2 text-right text-aurora-mint">{formatCurrency(m.estimatedCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel p-5">
          <h3 className="font-display text-lg font-semibold text-ink-50">Apps</h3>
          {byApp.length === 0 ? (
            <p className="mt-3 text-sm text-ink-300">No app usage yet. Authorize a local app from the OAuth Login page.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {byApp.map((a: any) => (
                <li key={a.appId || 'anon'} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                  <span className="text-ink-100">{a.appId || 'anonymous'}</span>
                  <span className="text-ink-300">{formatNumber(a.requests)} req · {formatCurrency(a.estimatedCost)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {insights.length > 0 && (
        <section className="panel p-5">
          <h3 className="font-display text-lg font-semibold text-ink-50">Insights</h3>
          <p className="text-xs text-ink-300">Surface cheaper routes, slow providers, and prompt repeats.</p>
          <ul className="mt-3 space-y-2 text-sm">
            {insights.map((i) => (
              <li key={i.kind} className={`rounded-2xl border px-3 py-3 ${
                i.severity === 'warn'
                  ? 'border-aurora-rose/30 bg-aurora-rose/10'
                  : 'border-aurora-violet/30 bg-aurora-violet/10'
              }`}>
                <div className="font-medium text-ink-50">{i.title}</div>
                <div className="text-xs text-ink-300">{i.detail}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Page>
  );
}
