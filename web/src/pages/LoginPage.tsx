import { motion } from 'framer-motion';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, session } from '../lib/api';
import { Icons } from '../lib/icons';

interface Props {
  onAuthed?: () => void;
}

export default function LoginPage({ onAuthed }: Props) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ token: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      session.set(data.token);
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
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="glass-strong gradient-border relative z-10 w-full max-w-md rounded-[36px] p-8"
      >
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-aurora-rose via-aurora-violet to-aurora-sky shadow-glow">
            <Icons.Hexagon className="h-6 w-6 text-ink-950" />
          </div>
          <div>
            <div className="font-display text-2xl font-semibold tracking-tight">
              Welcome to <span className="text-gradient">Bigliner</span>
            </div>
            <div className="text-xs uppercase tracking-[0.22em] text-ink-300">Local AI Gateway</div>
          </div>
        </div>
        <p className="mt-6 text-sm text-ink-200">
          Bigliner is a local-first control plane for 100+ AI providers. Sign in with the
          dashboard password from your <code className="rounded bg-white/10 px-1 py-0.5 text-[12px]">.env</code>.
        </p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <div>
            <label className="field-label" htmlFor="password">Dashboard password</label>
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
          {error && (
            <div className="rounded-2xl border border-aurora-rose/40 bg-aurora-rose/10 px-3 py-2 text-sm text-aurora-rose">
              {error}
            </div>
          )}
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? <Icons.Loader2 className="h-4 w-4 animate-spin" /> : <Icons.ArrowRight className="h-4 w-4" />}
            Enter dashboard
          </button>
        </form>
        <div className="mt-8 flex flex-wrap items-center gap-3 text-xs text-ink-300">
          <span className="pill"><Icons.ShieldCheck className="h-3 w-3 text-aurora-mint" /> Encrypted vault</span>
          <span className="pill"><Icons.Database className="h-3 w-3 text-aurora-sky" /> SQLite (local)</span>
          <span className="pill"><Icons.Sparkles className="h-3 w-3 text-aurora-violet" /> 100+ providers</span>
        </div>
      </motion.div>
    </div>
  );
}
