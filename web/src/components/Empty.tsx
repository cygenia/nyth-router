import { ReactNode } from 'react';
import { Icons, IconName } from '../lib/icons';

interface Props {
  icon?: IconName;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}

export function Empty({ icon = 'Sparkles', title, description, action }: Props) {
  const Icon = Icons[icon];
  return (
    <div className="panel flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-aurora-violet/30 via-aurora-sky/20 to-aurora-mint/30 text-aurora-violet">
        <Icon className="h-5 w-5" />
      </div>
      <div className="font-display text-lg font-semibold tracking-tight text-ink-50">{title}</div>
      {description && <div className="max-w-md text-sm text-ink-300">{description}</div>}
      {action}
    </div>
  );
}
