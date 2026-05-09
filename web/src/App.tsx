import { AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import { AuroraBackground } from './components/AuroraBackground';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { ToastProvider } from './components/Toast';
import { api, ApiError, session } from './lib/api';

import LoginPage from './pages/LoginPage';
import OverviewPage from './pages/OverviewPage';
import ProvidersPage from './pages/ProvidersPage';
import ProviderDetailPage from './pages/ProviderDetailPage';
import RoutesPage from './pages/RoutesPage';
import PlaygroundPage from './pages/PlaygroundPage';
import UsagePage from './pages/UsagePage';
import LogsPage from './pages/LogsPage';
import ApiKeysPage from './pages/ApiKeysPage';
import OAuthLoginPage from './pages/OAuthLoginPage';
import OAuthManagePage from './pages/OAuthManagePage';
import AuthJsonPage from './pages/AuthJsonPage';
import SettingsPage from './pages/SettingsPage';

function ProtectedShell() {
  const [open, setOpen] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [health, setHealth] = useState<any>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!session.read()) {
        if (!cancelled) {
          setAuthChecked(true);
          setAuthenticated(false);
        }
        return;
      }
      try {
        const data = await api<any>('/api/health');
        if (cancelled) return;
        setHealth(data);
        setAuthenticated(true);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          setAuthenticated(false);
        } else {
          setAuthenticated(true);
        }
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    }
    check();
    const id = setInterval(() => {
      api<any>('/api/health').then(setHealth).catch(() => undefined);
    }, 20000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  useEffect(() => { setOpen(false); }, [location.pathname]);

  if (!authChecked) {
    return (
      <div className="grid h-screen place-items-center text-ink-200">
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 animate-ping rounded-full bg-aurora-mint" />
          <span>Loading Bigliner…</span>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    if (location.pathname !== '/login') {
      navigate('/login', { replace: true });
    }
    return <LoginPage onAuthed={() => setAuthenticated(true)} />;
  }

  return (
    <div className="relative flex min-h-screen text-ink-100">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="relative z-10 flex min-h-screen flex-1 flex-col md:pl-0">
        <Topbar onMenu={() => setOpen(true)} health={health} />
        <main className="pretty-scroll flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
              <Route path="/" element={<OverviewPage />} />
              <Route path="/providers" element={<ProvidersPage />} />
              <Route path="/providers/:id" element={<ProviderDetailPage />} />
              <Route path="/routes" element={<RoutesPage />} />
              <Route path="/playground" element={<PlaygroundPage />} />
              <Route path="/usage" element={<UsagePage />} />
              <Route path="/logs" element={<LogsPage />} />
              <Route path="/api-keys" element={<ApiKeysPage />} />
              <Route path="/oauth/login" element={<OAuthLoginPage />} />
              <Route path="/oauth/manage" element={<OAuthManagePage />} />
              <Route path="/auth-json" element={<AuthJsonPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/login" element={<Navigate to="/" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuroraBackground />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<ProtectedShell />} />
      </Routes>
    </ToastProvider>
  );
}
