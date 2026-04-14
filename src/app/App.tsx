import { useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AppButton } from '../components/ui';
import { AuthPage } from '../features/auth/AuthPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { EditorPage } from '../features/editor/EditorPage';
import { getSeasonTheme } from '../lib/theme';
import { useAppStore } from '../state/app-store';

function ProtectedLayout() {
  const session = useAppStore((state) => state.session);
  const navigate = useNavigate();
  const location = useLocation();
  const isDashboardRoute = location.pathname === '/app';

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return (
    <div className="app-shell">
      {!location.pathname.startsWith('/app/erd/') && (
        <header className="app-topbar">
          <div className="topbar-brand">
            <strong>ERD Studio</strong>
          </div>
          <nav className="topbar-actions">
            {!isDashboardRoute && (
              <AppButton variant="ghost" onClick={() => navigate('/app')}>
                대시보드
              </AppButton>
            )}
          </nav>
        </header>
      )}
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}

function EditorLayout() {
  return (
    <div className="app-shell editor-shell">
      <main className="app-content editor-mode">
        <Outlet />
      </main>
    </div>
  );
}

function PublicRedirect() {
  const session = useAppStore((state) => state.session);
  return <Navigate to={session ? '/app' : '/login'} replace />;
}

export function App() {
  const theme = getSeasonTheme();

  useEffect(() => {
    document.body.classList.remove('theme-spring', 'theme-summer', 'theme-autumn', 'theme-winter');
    document.body.classList.add(theme.bodyClassName);

    return () => {
      document.body.classList.remove(theme.bodyClassName);
    };
  }, [theme.bodyClassName]);

  return (
    <Routes>
      <Route path="/" element={<PublicRedirect />} />
      <Route path="/login" element={<AuthPage />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/app" element={<DashboardPage />} />
      </Route>
      <Route element={<EditorLayout />}>
        <Route path="/app/erd/:erdId" element={<EditorPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
