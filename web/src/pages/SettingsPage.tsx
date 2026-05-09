import { useEffect, useState } from 'react';
import { Page } from '../components/Page';
import { Skeleton } from '../components/Skeleton';
import { Icons } from '../lib/icons';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';

const PROMPT_LOG_MODES = [
  { value: 'off', label: 'Off — no prompt content stored' },
  { value: 'metadata', label: 'Metadata only — no preview' },
  { value: 'preview', label: 'Preview — short snippet (default)' },
  { value: 'full', label: 'Full — keep full content' },
];

const TOKEN_SAVER_MODES = [
  { value: 'safe', label: 'Safe — light compression, safest formatting' },
  { value: 'balanced', label: 'Balanced — stronger compression for normal use' },
  { value: 'aggressive', label: 'Aggressive — maximum savings for noisy output' },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<any>(null);
  const [draft, setDraft] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
  const toast = useToast();

  async function load() {
    const data = await api<any>('/api/settings');
    setSettings(data);
    setDraft({
      defaultRoute: data.values.defaultRoute,
      promptLogMode: data.values.promptLogMode,
      maxFallbackDepth: data.values.maxFallbackDepth,
      logRetentionDays: data.values.logRetentionDays,
      requestTimeoutMs: data.values.requestTimeoutMs,
      retryCount: data.values.retryCount,
      theme: data.values.theme,
      tokenSaverEnabled: data.values.tokenSaverEnabled === 'true',
      tokenSaverMode: data.values.tokenSaverMode || 'safe',
      compressToolOutput: data.values.compressToolOutput !== 'false',
      compressAssistantOutput: data.values.compressAssistantOutput === 'true',
      maxToolOutputChars: Number(data.values.maxToolOutputChars || 12000),
    });
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setBusy(true);
    try {
      await api('/api/settings', { method: 'PUT', body: JSON.stringify({ values: draft }) });
      toast.push('Settings saved.', 'success');
      load();
    } catch (err: any) {
      toast.push(err?.message || 'Failed to save', 'error');
    } finally { setBusy(false); }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pwd.next !== pwd.confirm) { toast.push('Passwords do not match.', 'error'); return; }
    if (pwd.next.length < 15) { toast.push('Password must be at least 15 characters.', 'error'); return; }
    setBusy(true);
    try {
      await api('/api/auth/password', { method: 'POST', body: JSON.stringify({ currentPassword: pwd.current, newPassword: pwd.next }) });
      toast.push('Password updated.', 'success');
      setPwd({ current: '', next: '', confirm: '' });
    } catch (err: any) {
      toast.push(err?.message || 'Failed', 'error');
    } finally { setBusy(false); }
  }

  async function reset() {
    const word = prompt('This wipes apps, keys, routes and logs (registry/passwords stay). Type RESET to confirm.');
    if (word !== 'RESET') return;
    await api('/api/settings/reset-database', { method: 'POST', body: JSON.stringify({ confirm: 'RESET' }) });
    toast.push('Local data reset. Defaults will reseed on reload.', 'success');
  }

  if (!settings) return <Page title="Settings"><Skeleton rows={3} height={120} /></Page>;

  return (
    <Page
      title="Settings"
      description="Configure routing defaults, privacy, retention, Token Saver, and dashboard auth."
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="panel p-5">
          <h3 className="font-display text-lg font-semibold text-ink-50">Routing</h3>
          <div className="mt-3 space-y-3 text-sm">
            <div>
              <label className="field-label">Default route / model</label>
              <input className="field-input mt-1 font-mono" value={draft.defaultRoute || ''} onChange={(e) => setDraft({ ...draft, defaultRoute: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">Max fallback depth</label>
                <input type="number" className="field-input mt-1" value={draft.maxFallbackDepth ?? 4} onChange={(e) => setDraft({ ...draft, maxFallbackDepth: Number(e.target.value || 0) })} />
              </div>
              <div>
                <label className="field-label">Retry count</label>
                <input type="number" className="field-input mt-1" value={draft.retryCount ?? 0} onChange={(e) => setDraft({ ...draft, retryCount: Number(e.target.value || 0) })} />
              </div>
              <div className="col-span-2">
                <label className="field-label">Request timeout (ms)</label>
                <input type="number" className="field-input mt-1" value={draft.requestTimeoutMs ?? 60000} onChange={(e) => setDraft({ ...draft, requestTimeoutMs: Number(e.target.value || 0) })} />
              </div>
            </div>
          </div>
        </section>

        <section className="panel p-5">
          <h3 className="font-display text-lg font-semibold text-ink-50">Privacy & retention</h3>
          <div className="mt-3 space-y-3 text-sm">
            <div>
              <label className="field-label">Prompt log mode</label>
              <select className="field-input mt-1" value={draft.promptLogMode || 'preview'} onChange={(e) => setDraft({ ...draft, promptLogMode: e.target.value })}>
                {PROMPT_LOG_MODES.map((o) => <option key={o.value} value={o.value} className="bg-ink-950">{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Log retention (days)</label>
              <input type="number" className="field-input mt-1" value={draft.logRetentionDays ?? 30} onChange={(e) => setDraft({ ...draft, logRetentionDays: Number(e.target.value || 0) })} />
            </div>
            <div>
              <label className="field-label">Theme</label>
              <select className="field-input mt-1" value={draft.theme || 'aurora'} onChange={(e) => setDraft({ ...draft, theme: e.target.value })}>
                <option value="aurora" className="bg-ink-950">Aurora (default)</option>
                <option value="quiet" className="bg-ink-950">Quiet</option>
              </select>
            </div>
          </div>
        </section>
      </div>

      <section className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold text-ink-50">Token Saver</h3>
            <p className="text-xs text-ink-300">Reduce noisy tool and model payloads before they consume route context.</p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-ink-100">
            <input
              type="checkbox"
              checked={!!draft.tokenSaverEnabled}
              onChange={(e) => setDraft({ ...draft, tokenSaverEnabled: e.target.checked })}
            />
            Enabled
          </label>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
          <div>
            <label className="field-label">Compression mode</label>
            <select className="field-input mt-1" value={draft.tokenSaverMode || 'safe'} onChange={(e) => setDraft({ ...draft, tokenSaverMode: e.target.value })}>
              {TOKEN_SAVER_MODES.map((o) => <option key={o.value} value={o.value} className="bg-ink-950">{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Max tool output chars</label>
            <input type="number" className="field-input mt-1" value={draft.maxToolOutputChars ?? 12000} onChange={(e) => setDraft({ ...draft, maxToolOutputChars: Number(e.target.value || 0) })} />
          </div>
          <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-ink-100">
            <input type="checkbox" checked={draft.compressToolOutput !== false} onChange={(e) => setDraft({ ...draft, compressToolOutput: e.target.checked })} />
            <span>
              <span className="block font-medium">Compress tool output</span>
              <span className="block text-xs text-ink-300">Best for logs, shell output, JSON payloads, and stack traces.</span>
            </span>
          </label>
          <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-ink-100">
            <input type="checkbox" checked={!!draft.compressAssistantOutput} onChange={(e) => setDraft({ ...draft, compressAssistantOutput: e.target.checked })} />
            <span>
              <span className="block font-medium">Compress assistant output</span>
              <span className="block text-xs text-ink-300">Optional compact mode for long model responses.</span>
            </span>
          </label>
        </div>
      </section>

      <div className="flex justify-end">
        <button onClick={save} disabled={busy} className="btn-primary">
          {busy ? <Icons.Loader2 className="h-4 w-4 animate-spin" /> : <Icons.Sparkles className="h-4 w-4" />}
          Save settings
        </button>
      </div>

      <section className="panel p-5">
        <h3 className="font-display text-lg font-semibold text-ink-50">Dashboard password</h3>
        <p className="text-xs text-ink-300">Set or change the password used to sign into this dashboard. Minimum 15 characters.</p>
        <form onSubmit={changePassword} className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="field-label">Current</label>
            <input type="password" className="field-input mt-1" value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} />
          </div>
          <div>
            <label className="field-label">New</label>
            <input type="password" className="field-input mt-1" value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} minLength={15} required />
          </div>
          <div>
            <label className="field-label">Confirm</label>
            <input type="password" className="field-input mt-1" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} required />
          </div>
          <div className="md:col-span-3 md:justify-self-end">
            <button type="submit" disabled={busy} className="btn-primary">
              <Icons.Lock className="h-4 w-4" /> Update password
            </button>
          </div>
        </form>
      </section>

      <section className="panel p-5">
        <h3 className="font-display text-lg font-semibold text-ink-50">Runtime</h3>
        <dl className="mt-3 grid grid-cols-1 gap-2 text-sm md:grid-cols-3">
          <Field label="Host" value={settings.runtime.host} />
          <Field label="Port" value={settings.runtime.port} />
          <Field label="Database" value={settings.runtime.databasePath} />
          <Field label="Master key" value={settings.runtime.masterKeyPath} />
          <Field label="Node" value={settings.runtime.nodeVersion} />
          <Field label="Uptime (s)" value={settings.runtime.uptimeSec} />
        </dl>
      </section>

      <section className="panel p-5">
        <h3 className="font-display text-lg font-semibold text-aurora-rose">Danger zone</h3>
        <p className="text-xs text-ink-300">Reset local user data. Provider registry and dashboard password are kept.</p>
        <button onClick={reset} className="btn-danger mt-3 text-xs">
          <Icons.Trash2 className="h-3 w-3" /> Reset local database
        </button>
      </section>
    </Page>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
      <div className="field-label text-[10px]">{label}</div>
      <div className="break-all text-ink-100">{String(value ?? '—')}</div>
    </div>
  );
}
