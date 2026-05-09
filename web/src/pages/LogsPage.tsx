import { useEffect, useMemo, useState } from 'react';
import { Page } from '../components/Page';
import { Skeleton } from '../components/Skeleton';
import { Modal } from '../components/Modal';
import { Icons } from '../lib/icons';
import { api } from '../lib/api';
import { formatCurrency, formatLatency, formatNumber, relativeTime } from '../lib/format';

export default function LogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ q: '', status: 'all', providerId: 'all' });
  const [activeLog, setActiveLog] = useState<any>(null);
  const [providers, setProviders] = useState<any[]>([]);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.q) params.set('q', filter.q);
      if (filter.status !== 'all') params.set('status', filter.status);
      if (filter.providerId !== 'all') params.set('providerId', filter.providerId);
      const data = await api<any>(`/api/logs?${params.toString()}&limit=200`);
      setLogs(data.logs || []);
    } finally { setLoading(false); }
  }

  useEffect(() => {
    api<any>('/api/providers').then((r) => setProviders(r.providers || [])).catch(() => undefined);
  }, []);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter.q, filter.status, filter.providerId]);

  const stats = useMemo(() => ({
    count: logs.length,
    errors: logs.filter((l) => l.status !== 'ok').length,
    avgLatency: logs.length ? Math.round(logs.reduce((sum, l) => sum + (l.latencyMs || 0), 0) / logs.length) : 0,
    totalCost: logs.reduce((sum, l) => sum + (l.estimatedCost || 0), 0),
  }), [logs]);

  return (
    <Page
      title="Logs"
      description="Real-time request log viewer. Click a row for the full request detail, prompt preview, and fallback chain."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <span className="pill"><Icons.Activity className="h-3 w-3" /> {formatNumber(stats.count)} entries</span>
          <span className="pill-rose"><Icons.Trash2 className="h-3 w-3" /> {formatNumber(stats.errors)} errors</span>
          <span className="pill"><Icons.Gauge className="h-3 w-3" /> avg {formatLatency(stats.avgLatency)}</span>
          <a href="/api/logs/export.csv" className="btn-ghost">
            <Icons.ArrowDownToLine className="h-4 w-4" /> Export CSV
          </a>
        </div>
      }
    >
      <div className="panel flex flex-col gap-3 p-4 md:flex-row md:items-center">
        <div className="flex flex-1 items-center gap-2 rounded-2xl border border-white/10 bg-ink-900/60 px-3 py-2">
          <Icons.Search className="h-4 w-4 text-ink-300" />
          <input
            value={filter.q}
            onChange={(e) => setFilter({ ...filter, q: e.target.value })}
            placeholder="Search model, prompt preview…"
            className="flex-1 bg-transparent text-ink-50 placeholder:text-ink-300/70 outline-none"
          />
        </div>
        <select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })} className="rounded-xl border border-white/10 bg-ink-900/60 px-3 py-2 text-xs text-ink-100">
          <option value="all" className="bg-ink-950">all status</option>
          <option value="ok" className="bg-ink-950">success</option>
          <option value="error" className="bg-ink-950">errors</option>
        </select>
        <select value={filter.providerId} onChange={(e) => setFilter({ ...filter, providerId: e.target.value })} className="rounded-xl border border-white/10 bg-ink-900/60 px-3 py-2 text-xs text-ink-100">
          <option value="all" className="bg-ink-950">all providers</option>
          {providers.map((p) => <option key={p.id} value={p.id} className="bg-ink-950">{p.name}</option>)}
        </select>
      </div>

      {loading ? (
        <Skeleton rows={6} height={48} />
      ) : (
        <section className="panel overflow-hidden">
          <div className="overflow-x-auto pretty-scroll">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-ink-300">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Provider · Model</th>
                  <th className="px-4 py-3">Route / app</th>
                  <th className="px-4 py-3 text-right">Tokens</th>
                  <th className="px-4 py-3 text-right">Cost</th>
                  <th className="px-4 py-3 text-right">Latency</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-ink-300">No logs yet — send a test request via the Playground or your unified key.</td></tr>
                ) : logs.map((l) => (
                  <tr key={l.id} onClick={() => setActiveLog(l)} className="cursor-pointer border-t border-white/5 transition hover:bg-white/[0.04]">
                    <td className="px-4 py-3 text-ink-200">{relativeTime(l.ts)}</td>
                    <td className="px-4 py-3">
                      <div className="text-ink-100">{l.providerId || '—'}</div>
                      <div className="font-mono text-xs text-ink-300">{l.model || '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-ink-200">
                      {l.routeAlias ? <span className="font-mono text-xs">{l.routeAlias}</span> : '—'}
                      {l.appName && <div className="text-xs text-ink-300">{l.appName}</div>}
                    </td>
                    <td className="px-4 py-3 text-right text-ink-200">{formatNumber(l.totalTokens)}</td>
                    <td className="px-4 py-3 text-right text-aurora-mint">{formatCurrency(l.estimatedCost)}</td>
                    <td className="px-4 py-3 text-right text-ink-200">{formatLatency(l.latencyMs)}</td>
                    <td className="px-4 py-3">
                      {l.status === 'ok' ? (
                        <span className="pill-mint text-[10px]">ok</span>
                      ) : (
                        <span className="pill-rose text-[10px]" title={l.errorReason}>{l.errorReason || 'error'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Modal
        open={!!activeLog}
        onClose={() => setActiveLog(null)}
        size="lg"
        title={activeLog?.id}
        description={activeLog && `${new Date(activeLog.ts).toLocaleString()} · ${activeLog.providerId || '—'} · ${activeLog.model || '—'}`}
      >
        {activeLog && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Cell label="Status" value={activeLog.status} />
              <Cell label="Endpoint" value={activeLog.endpoint || '/v1/chat/completions'} />
              <Cell label="Route" value={activeLog.routeAlias || '—'} />
              <Cell label="App" value={activeLog.appName || '—'} />
              <Cell label="Latency" value={formatLatency(activeLog.latencyMs)} />
              <Cell label="Cost" value={formatCurrency(activeLog.estimatedCost)} />
              <Cell label="Input tokens" value={formatNumber(activeLog.inputTokens)} />
              <Cell label="Output tokens" value={formatNumber(activeLog.outputTokens)} />
            </div>
            {activeLog.fallbackChain?.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-300">Fallback chain</h4>
                <ul className="mt-2 space-y-1 text-xs">
                  {activeLog.fallbackChain.map((step: any, idx: number) => (
                    <li key={idx} className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5">
                      {idx + 1}. {step.providerId} · {step.model || 'auto'} {step.reason ? `→ ${step.reason}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {activeLog.promptPreview && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-300">Prompt preview</h4>
                <pre className="mt-2 max-h-40 overflow-auto pretty-scroll rounded-2xl border border-white/10 bg-ink-900/70 p-3 text-xs text-ink-100 whitespace-pre-wrap">{activeLog.promptPreview}</pre>
              </div>
            )}
            {activeLog.responsePreview && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-300">Response preview</h4>
                <pre className="mt-2 max-h-40 overflow-auto pretty-scroll rounded-2xl border border-white/10 bg-ink-900/70 p-3 text-xs text-ink-100 whitespace-pre-wrap">{activeLog.responsePreview}</pre>
              </div>
            )}
            {activeLog.errorReason && (
              <div className="rounded-2xl border border-aurora-rose/40 bg-aurora-rose/10 p-3 text-xs text-aurora-rose">
                {activeLog.errorReason}
              </div>
            )}
          </div>
        )}
      </Modal>
    </Page>
  );
}

function Cell({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <div className="field-label text-[10px]">{label}</div>
      <div className="text-ink-100">{value}</div>
    </div>
  );
}
