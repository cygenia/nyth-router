import { useEffect, useState } from 'react';
import { Page } from '../components/Page';
import { Icons } from '../lib/icons';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { copyToClipboard } from '../lib/format';

export default function AuthJsonPage() {
  const [sample, setSample] = useState<any>(null);
  const [exported, setExported] = useState<any>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    api<any>('/api/auth-json/sample').then((r) => setSample(r.sample)).catch(() => undefined);
  }, []);

  async function loadExport() {
    const data = await api<any>('/api/auth-json/export');
    setExported(data.config);
  }

  async function importConfig() {
    setBusy(true);
    try {
      const json = JSON.parse(draft);
      const data = await api<any>('/api/auth-json/import', { method: 'POST', body: JSON.stringify({ config: json }) });
      toast.push(`Imported: ${data.created.apps.length} apps, ${data.created.unifiedKeys.length} keys`, 'success');
    } catch (err: any) {
      toast.push(err?.message || 'Import failed', 'error');
    } finally { setBusy(false); }
  }

  return (
    <Page
      title="Auth JSON"
      description="Import or export Bigliner auth configuration. Exports never include secret values — they are redacted by default."
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="panel p-5">
          <h3 className="font-display text-lg font-semibold text-ink-50">Sample config</h3>
          <p className="text-xs text-ink-300">Use this as a starting point — paste into "Import" to seed.</p>
          <pre className="mt-3 max-h-80 overflow-auto pretty-scroll rounded-2xl border border-white/10 bg-ink-900/70 p-3 text-xs text-ink-100">
{sample ? JSON.stringify(sample, null, 2) : '...'}
          </pre>
          <button
            onClick={() => sample && copyToClipboard(JSON.stringify(sample, null, 2))}
            className="btn-ghost mt-3 text-xs"
          >
            <Icons.Copy className="h-3 w-3" /> Copy sample
          </button>
        </section>

        <section className="panel p-5">
          <h3 className="font-display text-lg font-semibold text-ink-50">Export current config</h3>
          <p className="text-xs text-ink-300">Always redacted — secrets stay local.</p>
          <button onClick={loadExport} className="btn-primary mt-3">
            <Icons.ArrowDownToLine className="h-4 w-4" /> Generate export
          </button>
          {exported && (
            <pre className="mt-3 max-h-80 overflow-auto pretty-scroll rounded-2xl border border-white/10 bg-ink-900/70 p-3 text-xs text-ink-100">
{JSON.stringify(exported, null, 2)}
            </pre>
          )}
        </section>
      </div>

      <section className="panel p-5">
        <h3 className="font-display text-lg font-semibold text-ink-50">Import</h3>
        <p className="text-xs text-ink-300">Paste a config JSON and import to seed apps and unified keys.</p>
        <textarea
          className="field-input mt-3 min-h-[160px] font-mono text-xs"
          placeholder='{"apps": [{ "name": "...", "scopes": ["chat:write"] }]}'
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button onClick={importConfig} disabled={busy || !draft} className="btn-primary mt-3">
          {busy ? <Icons.Loader2 className="h-4 w-4 animate-spin" /> : <Icons.Code2 className="h-4 w-4" />}
          Import
        </button>
      </section>
    </Page>
  );
}
