import { motion } from 'framer-motion';
import { ReactNode } from 'react';
import { IconName, Icons } from '../lib/icons';
import { usePreferences } from '../lib/preferences';

interface StatProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: IconName;
  accent?: 'rose' | 'violet' | 'sky' | 'mint' | 'peach';
}

const accentMap: Record<string, string> = {
  rose: 'from-aurora-rose/40 via-aurora-rose/10 to-transparent text-aurora-rose',
  violet: 'from-aurora-violet/40 via-aurora-violet/10 to-transparent text-aurora-violet',
  sky: 'from-aurora-sky/40 via-aurora-sky/10 to-transparent text-aurora-sky',
  mint: 'from-aurora-mint/40 via-aurora-mint/10 to-transparent text-aurora-mint',
  peach: 'from-aurora-peach/40 via-aurora-peach/10 to-transparent text-aurora-peach',
};

export function Stat({ label, value, hint, icon = 'Sparkles', accent = 'violet' }: StatProps) {
  const Icon = Icons[icon];
  const { t } = usePreferences();
  const renderedLabel = t(label);
  const renderedHint = typeof hint === 'string' ? t(hint) : hint;
  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ duration: 0.2 }}
      className="panel relative overflow-hidden p-5"
    >
      <div className={`absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br ${accentMap[accent]} opacity-70 blur-3xl`} />
      <div className="relative flex items-center justify-between">
        <span className="field-label">{renderedLabel}</span>
        <span className={`rounded-full border border-white/10 bg-white/5 p-2 ${accentMap[accent].split(' ').pop()}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="relative mt-3 font-display text-3xl font-semibold tracking-tight text-ink-50">
        {value}
      </div>
      {renderedHint && <div className="relative mt-1 text-xs text-ink-300">{renderedHint}</div>}
    </motion.div>
  );
}
