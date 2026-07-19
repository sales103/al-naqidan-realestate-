import { useState, useRef, useEffect } from 'react';
import { Bars3Icon, BellIcon, ArrowRightOnRectangleIcon, CheckIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useAuthStore } from '../../store/auth.store.ts';
import { useCompanyStore } from '../../store/company.store.ts';
import { authApi, whatsappApi, api } from '../../services/api.ts';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

const INSTANCES = ['naqidan-whatsapp-1', 'naqidan-whatsapp-2', 'naqidan-whatsapp-3'];

const notificationsApi = {
  list:        ()           => api.get('/notifications'),
  markRead:    (id: string) => api.patch(`/notifications/${id}/read`),
  markAllRead: ()           => api.patch('/notifications/read-all'),
};

const NOTIF_ICONS: Record<string, string> = {
  new_message:      '💬',
  new_client:       '👤',
  deal_update:      '📋',
  follow_up:        '🔔',
  ai_handoff:       '🤖',
  new_user_request: '🙋',
};

interface Props { onMenuClick: () => void; }

export default function Header({ onMenuClick }: Props) {
  const { clearAuth, user } = useAuthStore();
  const companyName = useCompanyStore(s => s.name_ar);
  const navigate    = useNavigate();
  const qc          = useQueryClient();
  const [showNotifs, setShowNotifs] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifs(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const { data: statusData } = useQuery({
    queryKey: ['whatsapp-header-status'],
    queryFn: async () => {
      const results = await Promise.allSettled(INSTANCES.map(name => whatsappApi.status(name)));
      return results.map((r, i) => ({
        name: INSTANCES[i],
        state: r.status === 'fulfilled'
          ? ((r.value as any)?.data?.data?.instance?.state ?? (r.value as any)?.data?.data?.state ?? 'close')
          : 'close',
      }));
    },
    refetchInterval: 15000,
    retry: false,
  });

  const { data: notifsRes } = useQuery({
    queryKey: ['notifications'],
    queryFn:  notificationsApi.list,
    refetchInterval: 20000,
    retry: false,
  });
  const notifications: any[] = (notifsRes as any)?.data?.data ?? [];
  const unreadCount: number  = (notifsRes as any)?.data?.unread ?? 0;

  const markRead    = useMutation({ mutationFn: (id: string) => notificationsApi.markRead(id),  onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  const markAllRead = useMutation({ mutationFn: notificationsApi.markAllRead,                    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });

  const connectedCount = statusData?.filter(s => s.state === 'open').length ?? 0;
  const isConnected    = connectedCount > 0;

  const handleLogout = async () => {
    try { await authApi.logout(); } finally {
      clearAuth(); navigate('/login');
      toast.success('تم تسجيل الخروج');
    }
  };

  const initials = (user?.full_name_ar ?? user?.full_name ?? 'م')[0];

  return (
    <header className="bg-white border-b border-gray-100 px-6 py-3.5 flex items-center gap-4 z-10 sticky top-0">
      {/* Hamburger */}
      <button onClick={onMenuClick} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors lg:hidden">
        <Bars3Icon className="w-5 h-5" />
      </button>

      {/* Search bar */}
      <div className="hidden md:flex flex-1 max-w-sm">
        <div className="relative w-full">
          <MagnifyingGlassIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="بحث سريع..."
            className="w-full bg-gray-50 border border-gray-200 rounded-xl pr-9 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all placeholder-gray-400"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 mr-auto">
        {/* WhatsApp pill */}
        <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border ${
          isConnected
            ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
            : 'bg-gray-50 text-gray-400 border-gray-100'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} />
          {isConnected ? `واتساب (${connectedCount})` : 'واتساب غير متصل'}
        </div>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button onClick={() => setShowNotifs(!showNotifs)}
            className="relative p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
            <BellIcon className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifs && (
            <div className="absolute left-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl shadow-black/5 border border-gray-100 overflow-hidden z-50 fade-in">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                <span className="font-semibold text-gray-900 text-sm">الإشعارات</span>
                {unreadCount > 0 && (
                  <button onClick={() => markAllRead.mutate()}
                    className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors">
                    <CheckIcon className="w-3 h-3" /> تحديد الكل
                  </button>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="py-10 text-center">
                    <BellIcon className="w-8 h-8 mx-auto mb-2 text-gray-200" />
                    <p className="text-sm text-gray-400">لا توجد إشعارات</p>
                  </div>
                ) : notifications.map((n: any) => (
                  <button key={n.id}
                    onClick={() => { if (!n.read_at) markRead.mutate(n.id); }}
                    className={`w-full text-right px-4 py-3 hover:bg-gray-50 transition-colors flex items-start gap-3 border-b border-gray-50 last:border-0 ${!n.read_at ? 'bg-blue-50/40' : ''}`}>
                    <span className="text-xl flex-shrink-0 mt-0.5 leading-none">{NOTIF_ICONS[n.notification_type] ?? '🔔'}</span>
                    <div className="min-w-0 flex-1 text-right">
                      <p className={`text-sm leading-snug ${!n.read_at ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>{n.title}</p>
                      {n.body && <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{n.body}</p>}
                      <p className="text-[10px] text-gray-300 mt-1">{format(new Date(n.created_at), 'dd MMM · HH:mm', { locale: ar })}</p>
                    </div>
                    {!n.read_at && <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User avatar + logout */}
        <div className="flex items-center gap-2 border-r border-gray-100 pr-2 mr-1">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">
            {initials}
          </div>
          <span className="hidden sm:block text-sm font-medium text-gray-700 max-w-[120px] truncate">
            {user?.full_name_ar ?? user?.full_name}
          </span>
        </div>

        <button onClick={handleLogout}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 px-2.5 py-2 rounded-xl hover:bg-red-50 transition-colors">
          <ArrowRightOnRectangleIcon className="w-4 h-4" />
          <span className="hidden sm:inline">خروج</span>
        </button>
      </div>
    </header>
  );
}