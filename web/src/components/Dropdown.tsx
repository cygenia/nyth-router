import { ReactNode, useMemo, useRef, useState } from 'react';
import { usePreferences } from '../lib/preferences';

type Option = { value: string; label: string; description?: string };

export function Dropdown({
  value,
  options,
  onChange,
  placeholder = 'Select...',
  className = '',
  buttonClassName = '',
  ariaLabelledBy,
  menuAlign = 'left',
  menuClassName = '',
  icon,
}: {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  ariaLabelledBy?: string;
  menuAlign?: 'left' | 'right';
  menuClassName?: string;
  icon?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { t } = usePreferences();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const selected = useMemo(() => options.find((item) => item.value === value), [options, value]);
  const menuId = useMemo(() => `dropdown-${Math.random().toString(36).slice(2)}`, []);

  return (
    <div className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
          if (event.key === 'ArrowDown') setOpen(true);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        aria-labelledby={ariaLabelledBy}
        className={`field-input flex items-center justify-between gap-3 text-left ${buttonClassName}`}
      >
        {icon ? (
          <span className="shrink-0 leading-none">{icon}</span>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate">{selected ? t(selected.label) : t(placeholder)}</span>
            <span className={`shrink-0 text-ink-300 transition ${open ? 'rotate-180' : ''}`}>⌄</span>
          </>
        )}
      </button>
      {open && (
        <div
          id={menuId}
          role="listbox"
          className={`absolute top-full z-50 mt-2 min-w-full max-h-72 overflow-auto rounded-2xl border border-white/10 bg-ink-950/98 p-1 shadow-glow backdrop-blur-xl ${menuAlign === 'right' ? 'right-0' : 'left-0'} ${menuClassName}`}
        >
          {options.map((item) => (
            <button
              key={item.value || item.label}
              type="button"
              role="option"
              aria-selected={item.value === value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => { onChange(item.value); setOpen(false); buttonRef.current?.focus(); }}
              className={`w-full rounded-xl px-3 py-2 text-left text-xs transition hover:bg-white/10 ${item.value === value ? 'bg-aurora-violet/15 text-aurora-mint' : 'text-ink-100'}`}
            >
              <div className="truncate font-medium">{t(item.label)}</div>
              {item.description && <div className="truncate text-[10px] text-ink-300">{t(item.description)}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
