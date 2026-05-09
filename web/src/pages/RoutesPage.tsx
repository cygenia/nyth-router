import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Page } from '../components/Page';
import { Skeleton } from '../components/Skeleton';
import { Modal } from '../components/Modal';
import { Empty } from '../components/Empty';
import { Icons } from '../lib/icons';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';

interface RouteStep {
  providerId: string;
  modelId?: string;
  fallbackOn?: string[];
}

interface RouteShape {
  id: string;
  alias: string;
  name: string;
  description: string;
  strategy: string;
  conditions: Record<string, any>;
  enabled: number;
  isDefault: number;
  steps: RouteStep[];
}

const DEFAULT_FALLBACK = ['error', 'rate_limit', 'timeout'];

export default function RoutesPage() {
  const [routes, setRoutes] = useState<RouteShape[]>([]);
  const [strategies, setStrategies] = useState<string[]>(['priority', 'cheapest', 'fastest', 'capability']);
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<RouteShape | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [simulator, setSimulator] = useState({ model: 'bigliner-smart', decision: null as any });
  const toast = useToast();

  async function load() {
    setLoading(true);
    try {
      const [rt, pv] = await Promise.all([
        api<any>('/api/routes'),
        api<any>('/api/providers'),
      ]);
      setRoutes(rt.routes || []);
      setStrategies(rt.strategies || []);
      setProviders(pv.providers || []);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function deleteRoute(id: string) {
    if (!confirm('Delete this route?')) return;
    await api(`/api/routes/${id}`, { method: 'DELETE' });
    toast.push('Route deleted', 'success');
    load();
  }

  async function simulate() {
    const data = await api<any>('/api/routes/simulate', {
      method: 'POST',
      body: JSON.stringify({ model: simulator.model }),
    });
    setSimulator({ ...simulator, decision: data.decision });
  }

  return (
    <Page
      title="Routes"
      description="Define how requests resolve. Use prefix routing (provider:model), aliases, or custom multi-step fallbacks."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Icons.Plus className="h-4 w-4" /> New route
          </button>
        </div>
      }
    >
      <section className="panel p-5">
        <h3 className="font-display text-base font-semibold text-ink-50">Route simulator</h3>
        <p className="text-xs text-ink-300">Type any model string to see how Bigliner would resolve it.</p>
        <div className="mt-3 flex flex-col gap-2 md:flex-row">
          <input
            value={simulator.model}
            onChange={(e) => setSimulator({ ...simulator, model: e.target.value })}
            placeholder="bigliner-fast, openai:gpt-5.5, anthropic:claude-opus-4.7…"
            className="field-input flex-1 font-mono"
          />
          <button onClick={simulate} className="btn-primary">
            <Icons.Wand2 className="h-4 w-4" /> Simulate
          </button>
        </div>
        {simulator.decision && (
          <pre className="mt-4 max-h-80 overflow-auto pretty-scroll rounded-2xl border border-white/10 bg-ink-900/70 p-4 font-mono text-xs text-ink-100">
{JSON.stringify(simulator.decision, null, 2)}
          </pre>
        )}
      </section>

      {loading ? (
        <Skeleton rows={3} height={120} />
      ) : routes.length === 0 ? (
        <Empty icon="Route" title="No routes yet" description="Create one to start aliasing models or building fallback chains." />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {routes.map((r) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="panel relative overflow-hidden p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display text-lg font-semibold text-ink-50">{r.name}</h3>
                    {r.isDefault === 1 && <span className="pill-mint text-[10px]">default</span>}
                    <span className="pill text-[10px]"><Icons.Wand2 className="h-3 w-3" /> {r.strategy}</span>
                  </div>
                  <code className="mt-1 inline-block rounded-md bg-white/5 px-2 py-0.5 font-mono text-xs text-aurora-mint">
                    {r.alias || r.id}
                  </code>
                  {r.description && <p className="mt-2 text-sm text-ink-300">{r.description}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setEditing(r)} className="rounded-full border border-white/10 bg-white/5 p-2 text-ink-100 hover:bg-white/10" aria-label="Edit">
                    <Icons.PencilLine className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => deleteRoute(r.id)} className="rounded-full border border-aurora-rose/40 bg-aurora-rose/10 p-2 text-aurora-rose hover:bg-aurora-rose/20" aria-label="Delete">
                    <Icons.Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {r.steps.map((s, idx) => (
                  <div key={idx} className="flex items-center gap-2 rounded-2xl border border-white/10 bg-ink-900/60 px-3 py-2 text-sm">
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-aurora-violet to-aurora-sky text-xs font-semibold text-ink-950">{idx + 1}</span>
                    <div className="flex-1">
                      <div className="font-medium text-ink-50">{s.providerId}<span className="text-ink-300"> :: </span>{s.modelId || 'auto'}</div>
                      <div className="text-xs text-ink-300">fallback on: {(s.fallbackOn || DEFAULT_FALLBACK).join(', ')}</div>
                    </div>
                    {idx < r.steps.length - 1 && <Icons.ArrowRight className="h-4 w-4 text-ink-300" />}
                  </div>
                ))}
              </div>
              {r.conditions && Object.keys(r.conditions).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {Object.entries(r.conditions).map(([k, v]) => (
                    <span key={k} className="pill text-[10px]">{k}: {String(v)}</span>
                  ))}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}

      <RouteEditor
        open={showCreate || editing !== null}
        onClose={() => { setShowCreate(false); setEditing(null); }}
        route={editing}
        providers={providers}
        strategies={strategies}
        onSaved={() => { setShowCreate(false); setEditing(null); load(); }}
      />
    </Page>
  );
}

function RouteEditor({
  open, onClose, route, providers, strategies, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  route: RouteShape | null;
  providers: any[];
  strategies: string[];
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<any>({
    alias: '',
    name: '',
    description: '',
    strategy: 'priority',
    isDefault: false,
    conditions: {},
    steps: [{ providerId: '', modelId: '', fallbackOn: DEFAULT_FALLBACK }],
  });
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (route) {
      setDraft({
        alias: route.alias || '',
        name: route.name || '',
        description: route.description || '',
        strategy: route.strategy || 'priority',
        isDefault: route.isDefault === 1,
        conditions: route.conditions || {},
        steps: route.steps.length ? route.steps : [{ providerId: '', modelId: '', fallbackOn: DEFAULT_FALLBACK }],
      });
    } else {
      setDraft({
        alias: '',
        name: '',
        description: '',
        strategy: 'priority',
        isDefault: false,
        conditions: {},
        steps: [{ providerId: '', modelId: '', fallbackOn: DEFAULT_FALLBACK }],
      });
    }
  }, [route, open]);

  function setStep(idx: number, patch: Partial<RouteStep>) {
    const next = draft.steps.slice();
    next[idx] = { ...next[idx], ...patch };
    setDraft({ ...draft, steps: next });
  }

  function addStep() {
    setDraft({ ...draft, steps: [...draft.steps, { providerId: '', modelId: '', fallbackOn: DEFAULT_FALLBACK }] });
  }

  function removeStep(idx: number) {
    const next = draft.steps.slice();
    next.splice(idx, 1);
    setDraft({ ...draft, steps: next.length ? next : [{ providerId: '', modelId: '', fallbackOn: DEFAULT_FALLBACK }] });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        alias: draft.alias || null,
        name: draft.name || draft.alias || 'Route',
        description: draft.description || '',
        strategy: draft.strategy,
        isDefault: !!draft.isDefault,
        conditions: draft.conditions,
        steps: draft.steps.filter((s: RouteStep) => s.providerId),
      };
      if (route) {
        await api(`/api/routes/${route.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        toast.push('Route updated.', 'success');
      } else {
        await api('/api/routes', { method: 'POST', body: JSON.stringify(payload) });
        toast.push('Route created.', 'success');
      }
      onSaved();
    } catch (err: any) {
      toast.push(err?.message || 'Could not save route', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={route ? 'Edit route' : 'New route'}
      description="Steps run top to bottom. If one fails for a matching reason, Bigliner falls back to the next."
      footer={
        <>
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button form="route-form" type="submit" disabled={busy} className="btn-primary">
            {busy ? <Icons.Loader2 className="h-4 w-4 animate-spin" /> : <Icons.Wand2 className="h-4 w-4" />}
            Save route
          </button>
        </>
      }
    >
      <form id="route-form" onSubmit={save} className="space-y-4 text-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="field-label">Alias (model string)</label>
            <input className="field-input mt-1 font-mono" value={draft.alias} onChange={(e) => setDraft({ ...draft, alias: e.target.value })} placeholder="bigliner-smart" />
          </div>
          <div>
            <label className="field-label">Display name</label>
            <input className="field-input mt-1" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <label className="field-label">Description</label>
            <input className="field-input mt-1" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </div>
          <div>
            <label className="field-label">Strategy</label>
            <select className="field-input mt-1" value={draft.strategy} onChange={(e) => setDraft({ ...draft, strategy: e.target.value })}>
              {strategies.map((s) => <option key={s} value={s} className="bg-ink-950">{s}</option>)}
            </select>
          </div>
          <label className="mt-7 flex cursor-pointer items-center gap-2 text-sm text-ink-100">
            <input type="checkbox" checked={!!draft.isDefault} onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })} className="h-4 w-4 rounded" />
            Make default route
          </label>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <span className="field-label">Conditions (optional)</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
            {[
              ['requiresVision', 'Vision'],
              ['requiresTools', 'Tools'],
              ['requiresStreaming', 'Streaming'],
              ['minContextLength', 'Min context'],
              ['maxCostPer1k', 'Max $/1k'],
              ['regionPreference', 'Region'],
            ].map(([k, label]) => (
              <input
                key={k}
                placeholder={label}
                value={draft.conditions[k as string] ?? ''}
                onChange={(e) => setDraft({ ...draft, conditions: { ...draft.conditions, [k as string]: e.target.value } })}
                className="rounded-2xl border border-white/10 bg-ink-900/60 px-3 py-2 text-xs text-ink-100"
              />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="field-label">Steps</span>
            <button type="button" onClick={addStep} className="text-xs text-aurora-mint hover:text-aurora-pink">
              <Icons.Plus className="inline-block h-3 w-3" /> Add step
            </button>
          </div>
          {draft.steps.map((step: RouteStep, idx: number) => (
            <div key={idx} className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
              <div className="flex items-center gap-2 text-xs text-ink-300">Step {idx + 1}</div>
              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                <select
                  value={step.providerId}
                  onChange={(e) => setStep(idx, { providerId: e.target.value })}
                  className="rounded-2xl border border-white/10 bg-ink-900/60 px-3 py-2 text-sm text-ink-100"
                >
                  <option value="" className="bg-ink-950">Pick provider</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id} className="bg-ink-950">{p.name} · {p.id}</option>
                  ))}
                </select>
                <input
                  className="rounded-2xl border border-white/10 bg-ink-900/60 px-3 py-2 font-mono text-sm text-ink-100"
                  placeholder="modelId (e.g. gpt-5.5)"
                  value={step.modelId || ''}
                  onChange={(e) => setStep(idx, { modelId: e.target.value })}
                />
                <input
                  className="rounded-2xl border border-white/10 bg-ink-900/60 px-3 py-2 text-sm text-ink-100"
                  placeholder="fallback on (comma list)"
                  value={(step.fallbackOn || DEFAULT_FALLBACK).join(',')}
                  onChange={(e) => setStep(idx, { fallbackOn: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                />
              </div>
              {draft.steps.length > 1 && (
                <button type="button" onClick={() => removeStep(idx)} className="mt-2 text-xs text-aurora-rose hover:text-aurora-pink">
                  Remove step
                </button>
              )}
            </div>
          ))}
        </div>
      </form>
    </Modal>
  );
}
