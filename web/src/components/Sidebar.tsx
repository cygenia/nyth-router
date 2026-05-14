import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Icons, IconName } from '../lib/icons';
import { api, session } from '../lib/api';
import { NythLogo } from './NythLogo';
import { usePreferences } from '../lib/preferences';

type NavItem = { to: string; labelKey: string; icon: IconName; group?: string };

const NAV: NavItem[] = [
  { to: '/', labelKey: 'home', icon: 'Home', group: 'workspace' },
  { to: '/overview', labelKey: 'overview', icon: 'BookText', group: 'workspace' },
  { to: '/providers', labelKey: 'apiProviders', icon: 'Plug', group: 'workspace' },
  { to: '/routes', labelKey: 'routes', icon: 'Route', group: 'workspace' },
  { to: '/playground', labelKey: 'playground', icon: 'Beaker', group: 'workspace' },
  { to: '/usage', labelKey: 'usage', icon: 'TrendingUp', group: 'insights' },
  { to: '/logs', labelKey: 'logs', icon: 'ListChecks', group: 'insights' },
  { to: '/api-keys', labelKey: 'apiKeys', icon: 'KeyRound', group: 'auth' },
  { to: '/oauth/login', labelKey: 'oauthLogin', icon: 'ShieldCheck', group: 'auth' },
  { to: '/oauth/manage', labelKey: 'oauthApps', icon: 'Crown', group: 'auth' },
  { to: '/auth-json', labelKey: 'authJson', icon: 'Code2', group: 'auth' },
  { to: '/settings', labelKey: 'settings', icon: 'Settings2', group: 'system' },
];

const groupOrder = ['workspace', 'insights', 'auth', 'system'];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: Props) {
  const navigate = useNavigate();
  const { t } = usePreferences();

  async function logout() {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
    session.clear();
    navigate('/login');
  }

  return (
    <>
      {open && (
        <button
          aria-label="Close menu"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden"
        />
      )}
      <aside
        className={`
          sidebar-shell fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-white/10 bg-ink-950/80 px-4 pb-4 pt-6
          backdrop-blur-md transition-transform duration-300 ease-out
          ${open ? 'translate-x-0' : '-translate-x-full'} md:static md:translate-x-0
        `}
      >
        <div className="flex items-center gap-3 px-2 pb-6">
          <NythLogo size="sm" />
          <div>
            <div className="font-display text-lg font-semibold tracking-tight text-ink-50">Nyth</div>
            <div className="text-[11px] tracking-[0.14em] text-ink-300">ready for work</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-full border border-white/10 p-1.5 text-ink-200 md:hidden"
            aria-label="Close menu"
          >
            <Icons.X className="h-4 w-4" />
          </button>
        </div>
        <nav className="pretty-scroll flex-1 space-y-6 overflow-y-auto pr-1">
          {groupOrder.map((group) => (
            <div key={group}>
              <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.32em] text-ink-300/70">
                {t(group)}
              </div>
              <ul className="space-y-1">
                {NAV.filter((n) => n.group === group).map((item) => {
                  const Icon = Icons[item.icon];
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.to === '/'}
                        onClick={onClose}
                        className={({ isActive }) =>
                          `group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition ${
                            isActive
                              ? 'bg-gradient-to-r from-aurora-violet/20 via-aurora-pink/15 to-aurora-sky/20 text-ink-50 shadow-[0_8px_24px_-12px_rgba(188,165,255,0.65)]'
                              : 'text-ink-200 hover:bg-white/5 hover:text-ink-50'
                          }`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {isActive && (
                              <motion.span
                                layoutId="nav-active"
                                className="absolute inset-0 rounded-2xl border border-white/15"
                                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                              />
                            )}
                            <Icon
                              className={`relative h-4 w-4 shrink-0 ${
                                isActive ? 'text-aurora-violet' : 'text-ink-300 group-hover:text-aurora-mint'
                              }`}
                            />
                            <span className="relative">{t(item.labelKey)}</span>
                          </>
                        )}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="mt-4 space-y-3 px-2">
          <NavLink
            to="/about"
            onClick={onClose}
            className={({ isActive }) =>
              `group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition ${
                isActive
                  ? 'bg-gradient-to-r from-aurora-violet/20 via-aurora-pink/15 to-aurora-sky/20 text-ink-50 shadow-[0_8px_24px_-12px_rgba(188,165,255,0.65)]'
                  : 'text-ink-200 hover:bg-white/5 hover:text-ink-50'
              }`
            }
          >
            <Icons.Info className="h-4 w-4 text-ink-300 group-hover:text-aurora-mint" />
            <span>{t('about')}</span>
          </NavLink>
          <div className="sidebar-card rounded-2xl border border-white/10 bg-gradient-to-br from-aurora-violet/15 via-aurora-sky/10 to-transparent p-4 text-sm text-ink-100">
            <div className="font-semibold">{t('privateByDefault')}</div>
            <p className="mt-1 text-xs text-ink-300">
              {t('encryptedProviderKeys')}
            </p>
          </div>
          <button onClick={logout} className="w-full text-left text-xs text-ink-300 hover:text-aurora-rose">
            {t('signOut')}
          </button>
        </div>
      </aside>
    </>
  );
}
