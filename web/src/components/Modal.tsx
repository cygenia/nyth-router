import { AnimatePresence, motion } from 'framer-motion';
import { ReactNode, useEffect } from 'react';
import { Icons } from '../lib/icons';
import { usePreferences } from '../lib/preferences';

interface Props {
  open: boolean;
  title?: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg' | 'xl';
}

const sizeMap = { md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' };

export function Modal({ open, title, description, onClose, children, footer, size = 'md' }: Props) {
  const { t } = usePreferences();
  const renderedTitle = typeof title === 'string' ? t(title) : title;
  const renderedDescription = typeof description === 'string' ? t(description) : description;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-y-0 left-0 right-0 z-50 flex items-center justify-center px-4 py-6 md:left-72 md:px-6"
        >
          <button onClick={onClose} aria-label="Close" className="absolute inset-0 bg-black/60 backdrop-blur-md" />
          <motion.div
            initial={{ y: 16, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            className={`relative z-10 w-full ${sizeMap[size]} glass-strong gradient-border max-h-[90vh] overflow-hidden rounded-3xl`}
          >
            <div className="flex items-start gap-3 border-b border-white/10 px-6 py-4">
              <div className="flex-1">
                {renderedTitle && <h3 className="font-display text-lg font-semibold tracking-tight text-ink-50">{renderedTitle}</h3>}
                {renderedDescription && <p className="mt-0.5 text-sm text-ink-300">{renderedDescription}</p>}
              </div>
              <button onClick={onClose} className="rounded-full border border-white/10 bg-white/5 p-1.5 text-ink-100 hover:bg-white/10" aria-label="Close">
                <Icons.X className="h-4 w-4" />
              </button>
            </div>
            <div className="pretty-scroll max-h-[60vh] overflow-y-auto px-6 py-5">
              {children}
            </div>
            {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/10 bg-white/[0.02] px-6 py-4">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
