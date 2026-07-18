import { Bars3Icon, BellIcon, ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline';
import { useAuthStore } from '../../store/auth.store.ts';
import { authApi, whatsappApi } from '../../services/api.ts';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

const INSTANCES = ['naqidan-whatsapp-1', 'naqidan-whatsapp-2', 'naqidan-whatsapp-3'];

interface Props { onMenuClick: () => void; }

export default function Header({ onMenuClick }: Props) {
  const { clearAuth } = useAuthStore();
  const navigate = useNavigate();

  // Check if any WhatsApp instance is connected
  const { data: statusData } = useQuery({
    queryKey: ['whatsapp-header-status'],
    queryFn: async () => {
      const results = await Promise.allSettled(
        INSTANCES.map(name => whatsappApi.status(name))
      );
      return results.map((r, i) => ({
        name: INSTANCES[i],
        state: r.status === 'fulfilled'
          ? ((r.value as any)?.data?.data?.instance?.state ?? (r.value as any)?.data?.data?.state ?? 'close')
          : 'close',
      }));
    },
    refetchInterval: 10000,
    retry: false,
  });

  const connectedInstances = statusData?.filter(s => s.state === 'open') ?? [];
  const isAnyConnected = connectedInstances.length > 0;

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } finally {
      clearAuth();
      navigate('/login');
      toast.success('تم تسجيل الخروج');
    }
  };

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <button onClick={onMenuClick} className="text-gray-500 hover:text-gray-700 lg:hidden">
          <Bars3Icon className="w-6 h-6" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-gray-900">شركة عبدالحكيم النقيدان للاستثمارات العقارية</h1>
          <p className="text-xs text-gray-500">نظام إدارة العقارات الذكي</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* WhatsApp status — real-time check */}
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

        <button className="relative text-gray-500 hover:text-gray-700 p-2 rounded-lg hover:bg-gray-100">
          <BellIcon className="w-5 h-5" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-red-600 px-3 py-2 rounded-lg hover:bg-red-50 transition-colors"
        >
          <ArrowRightOnRectangleIcon className="w-4 h-4" />
          خروج
        </button>
      </div>
    </header>
  );
}