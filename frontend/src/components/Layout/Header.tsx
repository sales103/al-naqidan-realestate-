import { useState, useRef, useEffect } from 'react';
import { Bars3Icon, BellIcon, ArrowRightOnRectangleIcon, CheckIcon } from '@heroicons/react/24/outline';
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
  list: () => api.get('/notifications'),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
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
  const { clearAuth } = useAuthStore();
  const companyName = useCompanyStore(s => s.name_ar);
  const navigate = useNavigate();
  const qc = useQueryClient();
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
    queryFn: notificationsApi.list,
    refetchInterval: 20000,
    retry: false,
  });
  const notifications: any[] = (notifsRes as any)?.data?.data ?? [];
  const unreadCount: number  = (notifsRes as any)?.data?.unread ?? 0;

  const markRead = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markAllRead = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const connectedInstances = statusData?.filter(s => s.state === 'open') ?? [];
  const isAnyConnected = connectedInstances.length > 0;

  const handleLogout = async () => {
    try { await authApi.logout(); } finally {
      clearAuth();
      navigate('/login');
      toast.success('تم تسجيل الخروج');
    }
  };

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
      <div className="flex items-center gap-4">
        <button onClick={onMenuClick} className="text-gray-500 hover:text-gray-700 lg:hidden">
          <Bars3Icon className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-gray-900">{companyName}</h1>
          <p className="text-xs text-gray-500">نظام إدارة العقارات الذكي</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {isAnyConnected ? (
          <div className="flex items-center gap-1.5 bg-green-50 text-green-700 px-3 py-1.5 rounded-full text-xs font-medium">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            واتساب متصل ({connectedInstances.length})
          </div>
        ) : (
          <div className="flex items-center gap-1.5 bg-red-50 text-red-600 px-3 py-1.5 rounded-full text-xs font-medium">
            <span className="w-2 h-2 bg-red-400 rounded-full" />
            واتساب غير متصل
          </div>
        )}

        <div className="relative" ref={notifRef}>
          <button onClick={() => setShowNotifs(!showNotifs)}
            className="relative text-gray-500 hover:text-gray-700 p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <BellIcon className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifs && (
            <div className="absolute left-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-50">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <span className="font-semibold text-gray-900 text-sm">الإشعارات</span>
                {unreadCount > 0 && (
                  <button onClick={() => markAllRead.mutate()}
                    className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                    <CheckIcon className="w-3.5 h-3.5" /> تحديد الكل كمقروء
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
                {notifications.length === 0 ? (
                  <div className="py-8 text-center text-gray-400">
                    <BellIcon className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">لا توجد إشعارات</p>
                  </div>
                ) : notifications.map((n: any) => (
                  <button key={n.id}
                    onClick={() => { if (!n.read_at) markRead.mutate(n.id); }}
                    className={`w-full text-right px-4 py-3 hover:bg-gray-50 transition-colors flex items-start gap-3 ${!n.read_at ? 'bg-blue-50/50' : ''}`}>
                    <span className="text-lg flex-shrink-0 mt-0.5">{NOTIF_ICONS[n.notification_type] ?? '🔔'}</span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm leading-snug ${!n.read_at ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                        {n.title}
                      </p>
                      {n.body && <p className="text-xs text-gray-500 mt-0.5 truncate">{n.body}</p>}
                      <p className="text-[10px] text-gray-400 mt-1">
                        {format(new Date(n.created_at), 'dd MMM - HH:mm', { locale: ar })}
                      </p>
                    </div>
                    {!n.read_at && <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <button onClick={handleLogout}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-red-600 px-3 py-2 rounded-lg hover:bg-red-50 transition-colors">
          <ArrowRightOnRectangleIcon className="w-4 h-4" />
          خروج
        </button>
      </div>
    </header>
  );
}