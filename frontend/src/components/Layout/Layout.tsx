import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.tsx';
import Header from './Header.tsx';
import { useState } from 'react';
import { useRealtimeNotifications } from '../../hooks/useRealtimeNotifications';

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useRealtimeNotifications();

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden" dir="rtl">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}