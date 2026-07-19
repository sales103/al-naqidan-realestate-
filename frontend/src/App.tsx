import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth.store.ts';
import Layout from './components/Layout/Layout.tsx';
import LoginPage from './pages/LoginPage.tsx';
import ForgotPasswordPage from './pages/ForgotPasswordPage.tsx';
import ResetPasswordPage from './pages/ResetPasswordPage.tsx';
import DashboardPage from './pages/DashboardPage.tsx';
import PropertiesPage from './pages/PropertiesPage.tsx';
import ClientsPage from './pages/ClientsPage.tsx';
import ConversationsPage from './pages/ConversationsPage.tsx';
import ReportsPage from './pages/ReportsPage.tsx';
import WhatsAppPage from './pages/WhatsAppPage.tsx';
import GoogleSheetsPage from './pages/GoogleSheetsPage.tsx';
import UsersPage from './pages/UsersPage.tsx';
import DealsPage from './pages/DealsPage.tsx';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
};

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="properties" element={<PropertiesPage />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="conversations" element={<ConversationsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="whatsapp" element={<WhatsAppPage />} />
        <Route path="sheets" element={<GoogleSheetsPage />} />
        <Route path="deals" element={<DealsPage />} />
        <Route path="users" element={<UsersPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}