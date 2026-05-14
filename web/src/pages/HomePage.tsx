import { useEffect, useState } from 'react';
import { Page } from '../components/Page';
import { ThemeMascot } from '../components/ThemeMascot';
import { api } from '../lib/api';
import { usePreferences } from '../lib/preferences';

export default function HomePage() {
  const { theme, t, locale } = usePreferences();
  const [center, setCenter] = useState<any>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api<any>('/api/system/management-center');
        if (!cancelled) setCenter(data);
      } catch {
        if (!cancelled) setCenter(null);
      }
    }
    load();
    const id = window.setInterval(load, 15000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  const timeLabel = now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
  const dateLabel = now.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const greetingLabel = center?.greeting ? t('Welcome back.') : t('Nyth is ready.');

  return (
    <Page title={t('Home')} description={t('Your personal home base.')}>
      <section className="panel relative overflow-hidden p-8 md:p-10">
        <div className="absolute -right-12 -top-16 h-56 w-56 rounded-full bg-aurora-mint/10 blur-3xl" />
        <div className="absolute -bottom-20 left-12 h-56 w-56 rounded-full bg-aurora-violet/10 blur-3xl" />
        <div className="relative flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.34em] text-aurora-mint">Nyth</p>
            <h1 className="overview-greeting mt-4 font-display text-3xl font-semibold leading-tight tracking-tight text-ink-50 md:text-4xl">
              {greetingLabel}
            </h1>
            <div className="home-time-card mt-5 text-left">
              <div className="font-mono text-3xl font-light leading-none tracking-[-0.04em] text-ink-50 tabular-nums md:text-4xl">{timeLabel}</div>
              <div className="mt-2 text-[11px] font-normal uppercase tracking-[0.18em] text-ink-300 md:text-xs">{dateLabel}</div>
            </div>
            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-ink-300 md:text-base">
              {t('Everything is ready when you need it.')}
            </p>
          </div>
          <ThemeMascot theme={theme} variant="home" className="shrink-0 self-center md:self-auto" />
        </div>
      </section>
    </Page>
  );
}
