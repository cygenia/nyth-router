import { ReactNode } from 'react';
import { Icons, IconName } from '../lib/icons';
import { usePreferences } from '../lib/preferences';

interface Props {
  icon?: IconName;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}

export function Empty({ icon = 'Sparkles', title, description, action }: Props) {
  const Icon = Icons[icon];
  const { t } = usePreferences();
  const renderedTitle = t(title);
  const renderedDescription = typeof description === 'string' ? t(description) : description;
  return (
    <div className="panel flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-aurora-violet/30 via-aurora-sky/20 to-aurora-mint/30 text-aurora-violet">
        <Icon className="h-5 w-5" />
      </div>
      <div className="font-display text-lg font-semibold tracking-tight text-ink-50">{renderedTitle}</div>
      {renderedDescription && <div className="max-w-md text-sm text-ink-300">{renderedDescription}</div>}
      {action}
    </div>
  );
}
