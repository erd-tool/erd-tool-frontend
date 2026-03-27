import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AppButton } from '../components/ui';
import { AuthPage } from '../features/auth/AuthPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { EditorPage } from '../features/editor/EditorPage';
import { useAppStore } from '../state/app-store';

function ProtectedLayout() {
  const session = useAppStore((state) => state.session);
  const navigate = useNavigate();
  const location = useLocation();

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div>
          <strong>ERD Studio</strong>
          <span>협업 ERD MVP</span>
        </div>
        <nav className="topbar-actions">
          <AppButton variant="ghost" onClick={() => navigate('/app')}>
            대시보드
          </AppButton>
        </nav>
      </header>
      <main className="app-content">
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
  return (
    <Routes>
      <Route path="/" element={<PublicRedirect />} />
      <Route path="/login" element={<AuthPage />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/app" element={<DashboardPage />} />
        <Route path="/app/erd/:erdId" element={<EditorPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
