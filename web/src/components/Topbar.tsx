import { Icons } from '../lib/icons';

interface Props {
  onMenu: () => void;
  health?: { promptLogMode?: string; uptime?: number } | null;
}

export function Topbar({ onMenu, health }: Props) {
  const uptimeLabel = health?.uptime != null ? formatUptime(health.uptime) : '—';
  const logMode = health?.promptLogMode || 'preview';
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/10 bg-ink-950/60 px-4 py-3 backdrop-blur-2xl md:px-6">
      <button
        onClick={onMenu}
        className="rounded-full border border-white/10 bg-white/5 p-2 text-ink-100 hover:bg-white/10 md:hidden"
        aria-label="Open navigation"
      >
        <Icons.Menu className="h-4 w-4" />
      </button>
      <div className="flex flex-1 items-center gap-3">
        <div className="hidden items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-ink-200 md:flex">
          <Icons.Search className="h-3.5 w-3.5" />
          <span>Search providers, routes, models…</span>
          <span className="ml-3 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-ink-300">⌘K</span>
        </div>
        <span className="pill md:hidden">
          <Icons.Sparkles className="h-3 w-3 text-aurora-mint" /> Bigliner
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="pill" title="Uptime since server boot">
          <Icons.Activity className="h-3 w-3 text-aurora-mint" /> {uptimeLabel}
        </span>
        <span className="pill" title="Prompt log mode">
          <Icons.ShieldCheck className="h-3 w-3 text-aurora-sky" /> {logMode}
        </span>
        <span className="pill-mint hidden md:inline-flex">
          <Icons.Zap className="h-3 w-3" /> live
        </span>
      </div>
    </header>
  );
}

function formatUptime(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}
