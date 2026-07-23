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
    <header className="sticky top-0 z-10 px-6 py-3 flex items-center gap-4" style={{
      background: 'rgba(242,246,255,0.85)',
      backdropFilter: 'blur(16px)',
      borderBottom: '1px solid rgba(59,91,219,0.08)',
      boxShadow: '0 1px 0 rgba(59,91,219,0.05), 0 4px 20px rgba(6,12,24,0.04)',
    }}>
      {/* Hamburger */}
      <button onClick={onMenuClick} className="lg:hidden p-1.5 rounded-lg transition-colors" style={{ color: '#7A8FAA' }}>
        <Bars3Icon className="w-5 h-5" />
      </button>

      {/* Search */}
      <div className="hidden md:flex flex-1 max-w-sm">
        <div className="relative w-full">
          <MagnifyingGlassIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#94A3B8' }} />
          <input
            type="text"
            placeholder="بحث سريع..."
            className="w-full pr-9 pl-3 py-2 text-sm rounded-xl transition-all outline-none placeholder-slate-400"
            style={{
              background: 'rgba(255,255,255,0.8)',
              border: '1px solid rgba(59,91,219,0.1)',
              color: '#0F1C35',
            }}
            onFocus={e => {
              e.target.style.background = '#fff';
              e.target.style.border = '1px solid rgba(59,91,219,0.35)';
              e.target.style.boxShadow = '0 0 0 3px rgba(59,91,219,0.08)';
            }}
            onBlur={e => {
              e.target.style.background = 'rgba(255,255,255,0.8)';
              e.target.style.border = '1px solid rgba(59,91,219,0.1)';
              e.target.style.boxShadow = 'none';
            }}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 mr-auto">
        {/* WhatsApp status pill */}
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={
          isConnected
            ? { background: 'rgba(5,150,105,0.08)', color: '#059669', border: '1px solid rgba(5,150,105,0.15)' }
            : { background: 'rgba(100,116,139,0.07)', color: '#94A3B8', border: '1px solid rgba(100,116,139,0.12)' }
        }>
          <span className="w-1.5 h-1.5 rounded-full" style={{
            background: isConnected ? '#22C55E' : '#94A3B8',
            boxShadow: isConnected ? '0 0 6px rgba(34,197,94,0.5)' : 'none',
            animation: isConnected ? 'pulse 2s infinite' : 'none',
          }} />
          {isConnected ? `واتساب (${connectedCount})` : 'واتساب غير متصل'}
        </div>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button onClick={() => setShowNotifs(!showNotifs)}
            className="relative p-2 rounded-xl transition-all"
            style={{ color: '#7A8FAA' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(59,91,219,0.07)'; (e.currentTarget as HTMLButtonElement).style.color = '#3B5BDB'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#7A8FAA'; }}>
            <BellIcon className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1 leading-none"
                style={{ background: 'linear-gradient(135deg, #EF4444, #F87171)', boxShadow: '0 1px 4px rgba(239,68,68,0.4)' }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifs && (
            <div className="absolute left-0 top-full mt-2 w-80 rounded-2xl overflow-hidden z-50 fade-in" style={{
              background: 'rgba(255,255,255,0.95)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(59,91,219,0.1)',
              boxShadow: '0 8px 32px rgba(6,12,24,0.12), 0 2px 8px rgba(6,12,24,0.06)',
            }}>
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(59,91,219,0.07)' }}>
                <span className="font-bold text-sm" style={{ color: '#0F1C35' }}>الإشعارات</span>
                {unreadCount > 0 && (
                  <button onClick={() => markAllRead.mutate()}
                    className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors"
                    style={{ color: '#3B5BDB', background: 'rgba(59,91,219,0.07)' }}>
                    <CheckIcon className="w-3 h-3" /> تحديد الكل
                  </button>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="py-10 text-center">
                    <BellIcon className="w-8 h-8 mx-auto mb-2" style={{ color: '#D1D9F0' }} />
                    <p className="text-sm" style={{ color: '#94A3B8' }}>لا توجد إشعارات</p>
                  </div>
                ) : notifications.map((n: any) => (
                  <button key={n.id}
                    onClick={() => { if (!n.read_at) markRead.mutate(n.id); }}
                    className="w-full text-right px-4 py-3 flex items-start gap-3 transition-colors"
                    style={{
                      background: !n.read_at ? 'rgba(59,91,219,0.04)' : 'transparent',
                      borderBottom: '1px solid rgba(59,91,219,0.05)',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,91,219,0.06)')}
                    onMouseLeave={e => (e.currentTarget.style.background = !n.read_at ? 'rgba(59,91,219,0.04)' : 'transparent')}>
                    <span className="text-xl flex-shrink-0 mt-0.5 leading-none">{NOTIF_ICONS[n.notification_type] ?? '🔔'}</span>
                    <div className="min-w-0 flex-1 text-right">
                      <p className="text-sm leading-snug" style={{ fontWeight: !n.read_at ? 700 : 400, color: !n.read_at ? '#0F1C35' : '#5A6882' }}>{n.title}</p>
                      {n.body && <p className="text-xs mt-0.5 line-clamp-1" style={{ color: '#94A3B8' }}>{n.body}</p>}
                      <p className="text-[10px] mt-1" style={{ color: '#C4CEDE' }}>{format(new Date(n.created_at), 'dd MMM · HH:mm', { locale: ar })}</p>
                    </div>
                    {!n.read_at && <span className="w-2 h-2 rounded-full flex-shrink-0 mt-2" style={{ background: '#3B5BDB', boxShadow: '0 0 6px rgba(59,91,219,0.5)' }} />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '24px', background: 'rgba(59,91,219,0.1)' }} />

        {/* User */}
        <button onClick={() => navigate('/profile')} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-all"
          style={{ cursor: 'pointer' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(59,91,219,0.07)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{
            background: 'linear-gradient(135deg, #A8892E, #C8A84B)',
            color: '#1a0f00',
            boxShadow: '0 2px 8px rgba(200,168,75,0.3)',
          }}>
            {initials}
          </div>
          <span className="hidden sm:block text-sm font-semibold max-w-[120px] truncate" style={{ color: '#1A2E50' }}>
            {user?.full_name_ar ?? user?.full_name}
          </span>
        </button>

        <button onClick={handleLogout}
          className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-2 rounded-xl transition-all"
          style={{ color: '#94A3B8' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#EF4444'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.07)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#94A3B8'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}>
          <ArrowRightOnRectangleIcon className="w-4 h-4" />
          <span className="hidden sm:inline">خروج</span>
        </button>
      </div>
    </header>
  );
}
