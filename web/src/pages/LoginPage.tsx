import { motion } from 'framer-motion';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, session, SessionDuration } from '../lib/api';
import { Icons } from '../lib/icons';
import { Dropdown } from '../components/Dropdown';
import { NythLogo } from '../components/NythLogo';
import { ThemeName, usePreferences } from '../lib/preferences';

interface Props {
  onAuthed?: () => void;
}

const SESSION_DURATION_OPTIONS: { value: SessionDuration; labelKey: string; descriptionKey: string }[] = [
  { value: 'never', labelKey: 'never', descriptionKey: 'neverDesc' },
  { value: '30m', labelKey: 'thirtyMinutes', descriptionKey: 'thirtyMinutesDesc' },
  { value: '1h', labelKey: 'oneHour', descriptionKey: 'oneHourDesc' },
  { value: '6h', labelKey: 'sixHours', descriptionKey: 'sixHoursDesc' },
  { value: '24h', labelKey: 'twentyFourHours', descriptionKey: 'twentyFourHoursDesc' },
  { value: 'remember', labelKey: 'rememberPassword', descriptionKey: 'rememberPasswordDesc' },
];

export default function LoginPage({ onAuthed }: Props) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [duration, setDuration] = useState<SessionDuration>('remember');
  const navigate = useNavigate();
  const { theme, setTheme, t } = usePreferences();
  const durationOptions = SESSION_DURATION_OPTIONS.map((item) => ({
    value: item.value,
    label: t(item.labelKey),
    description: t(item.descriptionKey),
  }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ token: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password, duration }),
      });
      session.set(data.token, duration);
      onAuthed?.();
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err?.message === 'invalid_password' ? 'That password is not correct.' : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden px-6 py-10 text-ink-100">
      <div className="absolute right-5 top-5 z-20 flex rounded-full border border-white/10 bg-white/5 p-1 shadow-soft backdrop-blur">
        {(['aurora', 'dark', 'lite'] as ThemeName[]).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTheme(item)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition ${theme === item ? 'bg-white/15 text-ink-50 shadow-glow' : 'text-ink-300 hover:bg-white/10 hover:text-ink-50'}`}
            aria-pressed={theme === item}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="relative z-10 flex w-full max-w-md items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="glass-strong gradient-border relative order-2 w-full max-w-md rounded-[36px] p-8"
        >
          <div className="flex flex-col items-center text-center">
            <NythLogo size="hero" />
            <div className="font-display text-3xl font-semibold tracking-tight">
              {t('welcomeTo')} <span className="text-gradient">Nyth</span>
            </div>
            <div className="mt-1 text-sm text-ink-300">Your private model workspace</div>
          </div>
          <p className="mt-6 text-sm text-ink-200">
            {t('loginIntro')}
          </p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <div>
            <label className="field-label" htmlFor="password">{t('dashboardPassword')}</label>
            <div className="mt-2 flex items-center gap-2 rounded-2xl border border-white/10 bg-ink-900/60 px-3 py-2.5 focus-within:border-aurora-violet/60">
              <Icons.Lock className="h-4 w-4 text-ink-300" />
              <input
                id="password"
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="flex-1 bg-transparent text-ink-50 placeholder:text-ink-300/60 outline-none"
                autoFocus
                required
              />
              <button type="button" onClick={() => setShow((s) => !s)} className="text-ink-300 hover:text-aurora-mint" aria-label="Toggle visibility">
                {show ? <Icons.EyeOff className="h-4 w-4" /> : <Icons.Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="field-label" htmlFor="session-duration">{t('sessionDuration')}</label>
            <div className="mt-2 flex items-center gap-2 rounded-2xl border border-white/10 bg-ink-900/60 px-3 py-2.5 focus-within:border-aurora-violet/60">
              <Icons.Clock className="h-4 w-4 text-ink-300" />
              <Dropdown
                value={duration}
                options={durationOptions}
                onChange={(value) => setDuration(value as SessionDuration)}
                ariaLabelledBy="session-duration"
                className="flex-1"
                buttonClassName="border-0 bg-transparent px-0 py-0 text-sm shadow-none"
              />
            </div>
            <p className="mt-2 text-xs text-ink-300">
              {t('sessionHelp')}
            </p>
          </div>
          {error && (
            <div className="rounded-2xl border border-aurora-rose/40 bg-aurora-rose/10 px-3 py-2 text-sm text-aurora-rose">
              {error}
            </div>
          )}
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? <Icons.Loader2 className="h-4 w-4 animate-spin" /> : <Icons.ArrowRight className="h-4 w-4" />}
            {t('enterDashboard')}
          </button>
        </form>
        <div className="mt-8 flex flex-wrap items-center gap-3 text-xs text-ink-300">
          <span className="pill"><Icons.ShieldCheck className="h-3 w-3 text-aurora-mint" /> {t('encryptedVault')}</span>
          <span className="pill"><Icons.Database className="h-3 w-3 text-aurora-sky" /> {t('sqliteLocal')}</span>
          <span className="pill"><Icons.Sparkles className="h-3 w-3 text-aurora-violet" /> 100+ providers</span>
        </div>
        </motion.div>
      </div>
    </div>
  );
}
