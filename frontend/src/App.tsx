import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './store/auth.store.ts';
import { useCompanyStore } from './store/company.store.ts';
import { api, settingsApi } from './services/api.ts';
import Layout from './components/Layout/Layout.tsx';
import LoginPage from './pages/LoginPage.tsx';
import RegisterPage from './pages/RegisterPage.tsx';
import ForgotPasswordPage from './pages/ForgotPasswordPage.tsx';
import SetupPage from './pages/SetupPage.tsx';
import DashboardPage from './pages/DashboardPage.tsx';
import PropertiesPage from './pages/PropertiesPage.tsx';
import ClientsPage from './pages/ClientsPage.tsx';
import ConversationsPage from './pages/ConversationsPage.tsx';
import ReportsPage from './pages/ReportsPage.tsx';
import WhatsAppPage from './pages/WhatsAppPage.tsx';
import GoogleSheetsPage from './pages/GoogleSheetsPage.tsx';
import UsersPage from './pages/UsersPage.tsx';
import SettingsPage from './pages/SettingsPage.tsx';
import ProfilePage from './pages/ProfilePage.tsx';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
};

function SetupGuard({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const setCompany = useCompanyStore(s => s.setCompany);

  useEffect(() => {
    // Load company name for branding (non-blocking)
    settingsApi.getCompany().then((res: any) => {
      const c = res.data?.data;
      if (c) setCompany({ name_ar: c.name_ar, name: c.name, phone: c.phone, address: c.address });
    }).catch(() => {});

    if (location.pathname === '/setup') { setChecking(false); return; }
    api.get('/setup/status').then((res: any) => {
      if (!res.data?.completed) navigate('/setup', { replace: true });
    }).catch(() => {}).finally(() => setChecking(false));
  }, []);

  if (checking) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  return <>{children}</>;
}

export default function App() {
  return (
    <SetupGuard>
      <Routes>
        <Route path="/setup"           element={<SetupPage />} />
        <Route path="/login"           element={<LoginPage />} />
        <Route path="/register"        element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"     element={<DashboardPage />} />
          <Route path="properties"    element={<PropertiesPage />} />
          <Route path="clients"       element={<ClientsPage />} />
          <Route path="conversations" element={<ConversationsPage />} />
          <Route path="reports"       element={<ReportsPage />} />
          <Route path="whatsapp"      element={<WhatsAppPage />} />
          <Route path="sheets"        element={<GoogleSheetsPage />} />
          <Route path="users"         element={<UsersPage />} />
          <Route path="settings"      element={<SettingsPage />} />
          <Route path="profile"       element={<ProfilePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </SetupGuard>
  );
}