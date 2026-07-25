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
        {/* overflow-x-hidden is not redundant: an element told to scroll only
            vertically still computes overflow-x to `auto`, which makes it a
            horizontal scroll container. Dragging to select text then
            auto-scrolls it sideways and the whole page slides off screen with
            no scrollbar to bring it back. */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="max-w-7xl mx-auto p-3 sm:p-4 lg:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
