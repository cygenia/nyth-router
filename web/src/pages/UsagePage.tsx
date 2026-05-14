import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Page } from '../components/Page';
import { Stat } from '../components/Stat';
import { Skeleton } from '../components/Skeleton';
import { Dropdown } from '../components/Dropdown';
import { Icons } from '../lib/icons';
import { api } from '../lib/api';
import { formatCost, formatCurrency, formatNumber } from '../lib/format';

const COLORS = ['#bca5ff', '#ff8fb6', '#9ec9ff', '#9ce4c5', '#ffd2a4', '#fff4a4', '#f6a4ff'];

const PROVIDER_COLORS: Record<string, string> = {
  openai: '#10a37f',
  codex: '#10a37f',
  anthropic: '#d97757',
  'claude-oauth': '#d97757',
  google: '#4285f4',
  gemini: '#4285f4',
  'gemini-oauth': '#4285f4',
  xai: '#71717a',
  moonshot: '#8b5cf6',
  minimax: '#f97316',
  zhipu: '#14b8a6',
  'zhipu-glm': '#14b8a6',
  mistral: '#ff7000',
  cohere: '#8b5cf6',
  deepseek: '#38bdf8',
  groq: '#f97316',
  together: '#7c3aed',
  fireworks: '#ef4444',
  perplexity: '#20e3d2',
  openrouter: '#8b5cf6',
  'azure-openai': '#0078d4',
  'aws-bedrock': '#ff9900',
  cloudflare: '#f38020',
  huggingface: '#ffd21e',
  'nvidia-nim': '#76b900',
  'alibaba-dashscope': '#ff6a00',
  'github-models': '#30363d',
  ollama: '#3f3f46',
  lmstudio: '#4f46e5',
  vllm: '#0891b2',
  'litellm-proxy': '#8b5cf6',
};

function providerColor(providerId: string, index: number) {
  return PROVIDER_COLORS[String(providerId || '').toLowerCase()] || COLORS[index % COLORS.length];
}

function brightenHex(hex: string, amount = 18) {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return hex;
  const channels = [0, 2, 4].map((start) => Math.min(255, parseInt(normalized.slice(start, start + 2), 16) + amount));
  return `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function chartTextColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--chart-text').trim() || '#bcc4dc';
}

function chartGridColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--chart-grid').trim() || 'rgba(255,255,255,0.06)';
}

function chartTooltipStyle(): CSSProperties {
  const root = getComputedStyle(document.documentElement);
  return {
    background: root.getPropertyValue('--chart-tooltip-bg').trim() || 'rgba(11,13,29,0.95)',
    border: `1px solid ${root.getPropertyValue('--chart-tooltip-border').trim() || 'rgba(255,255,255,0.08)'}`,
    borderRadius: 14,
    color: root.getPropertyValue('--chart-text').trim() || '#bcc4dc',
  };
}


export default function UsagePage() {
  const [overview, setOverview] = useState<any>(null);
  const [byProvider, setByProvider] = useState<any[]>([]);
  const [byModel, setByModel] = useState<any[]>([]);
  const [byApp, setByApp] = useState<any[]>([]);
  const [insights, setInsights] = useState<any[]>([]);
  const [pricingCoverage, setPricingCoverage] = useState<any>(null);
  const [days, setDays] = useState(14);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [ov, pv, mo, ap, ins, pc] = await Promise.all([
        api<any>('/api/usage/overview'),
        api<any>(`/api/usage/by-provider?days=${days}`),
        api<any>(`/api/usage/by-model?days=${days}`),
        api<any>(`/api/usage/by-app?days=${days}`),
        api<any>('/api/usage/insights'),
        api<any>(`/api/usage/pricing-coverage?days=${days}`),
      ]);
      setOverview(ov.overview);
      setByProvider(pv.byProvider || []);
      setByModel(mo.byModel || []);
      setByApp(ap.byApp || []);
      setInsights(ins.insights || []);
      setPricingCoverage(pc.coverage || null);
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

  const chartText = chartTextColor();
  const chartGrid = chartGridColor();
  const tooltipStyle = chartTooltipStyle();
  const providerBars = useMemo(() => byProvider.map((row, index) => {
    const color = providerColor(row.providerId, index);
    return { ...row, chartColor: color, chartStroke: brightenHex(color, 24) };
  }), [byProvider]);

  return (
    <Page
      title="Usage"
      description="A clear look at usage, cost, and where the work is going."
      actions={
        <div className="flex flex-wrap items-center gap-2">
<Dropdown
value={String(days)}
onChange={(value) => setDays(Number(value))}
options={[7, 14, 30, 60].map((d) => ({ value: String(d), label: `last ${d} days` }))}
className="w-36"
buttonClassName="!rounded-xl !bg-ink-900/60 !px-3 !py-2 !text-xs !text-ink-100"
menuAlign="right"
/>
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
            <Stat icon="Sparkles" accent="mint" label="Estimated cost" value={formatCost(overview.totals.estimatedCost, overview.totals.costIncomplete)} hint={overview.totals.costIncomplete ? 'pricing incomplete' : 'all time'} />
            <Stat icon="Gauge" accent="rose" label="Errors" value={formatNumber(overview.totals.errors)} hint={`${((overview.totals.errors / Math.max(1, overview.totals.requests)) * 100).toFixed(1)}% rate`} />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="panel p-5 lg:col-span-2">
          <h3 className="font-display text-lg font-semibold text-ink-50">Cost by provider</h3>
          <p className="text-xs text-ink-300">Last {days} days{pricingCoverage?.unknownCount ? ` - ${pricingCoverage.unknownCount} unpriced model${pricingCoverage.unknownCount === 1 ? '' : 's'}` : ''}</p>
          <div className="mt-4 h-72">
            {loading ? <Skeleton rows={1} height={240} /> : providerBars.length === 0 ? (
              <div className="grid h-full place-items-center text-sm text-ink-300">No data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={providerBars} margin={{ top: 22, right: 18, left: 2, bottom: 8 }} barCategoryGap="28%">
                  <CartesianGrid stroke={chartGrid} strokeWidth={1.2} vertical={false} />
                  <XAxis dataKey="providerId" stroke={chartText} tick={{ fontSize: 11, fill: chartText, fontWeight: 700 }} tickLine={false} axisLine={false} />
                  <YAxis stroke={chartText} tick={{ fontSize: 11, fill: chartText, fontWeight: 700 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.045)' }}
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: chartText, fontWeight: 700 }}
                    formatter={(v: number, _name: any, props: any) => formatCost(v, props?.payload?.costIncomplete)}
                  />
                  <Bar dataKey="estimatedCost" radius={[12, 12, 5, 5]} fillOpacity={1} strokeWidth={1.5} isAnimationActive={false}>
                    {providerBars.map((row, i) => <Cell key={row.providerId || i} fill={row.chartColor} stroke={row.chartStroke} fillOpacity={1} />)}
                    <LabelList dataKey="estimatedCost" position="top" formatter={(v: number) => formatCurrency(v)} fill={chartText} fontSize={11} fontWeight={700} />
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
                  <Legend wrapperStyle={{ color: chartText }} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: chartText }}
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
                      <td className="px-3 py-2 text-right text-aurora-mint">{formatCost(m.estimatedCost, m.costIncomplete)}</td>
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
                  <span className="text-ink-300">{formatNumber(a.requests)} req, {formatCost(a.estimatedCost, a.costIncomplete)}</span>
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
