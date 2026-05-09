import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface PageProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function Page({ title, description, actions, children }: PageProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="px-4 py-6 md:px-8 md:py-10"
    >
      <header className="mb-6 flex flex-col gap-3 md:mb-8 md:flex-row md:items-end md:justify-between">
        <div className="max-w-3xl">
          <h1 className="font-display text-2xl font-semibold leading-tight tracking-tight text-ink-50 md:text-4xl">
            {title}
          </h1>
          {description && <p className="mt-2 text-sm leading-relaxed text-ink-300 md:text-base">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 md:justify-end">{actions}</div>}
      </header>
      <div className="space-y-6">{children}</div>
    </motion.div>
  );
}
