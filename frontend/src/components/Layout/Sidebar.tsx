import { NavLink } from 'react-router-dom';
import {
  HomeIcon, BuildingOfficeIcon, UsersIcon,
  ChatBubbleLeftRightIcon, ChartBarIcon,
  XMarkIcon, TableCellsIcon, UserGroupIcon, Cog6ToothIcon, DevicePhoneMobileIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '../../store/auth.store.ts';
import { useCompanyStore } from '../../store/company.store.ts';

const navMain = [
  { to: '/dashboard',     icon: HomeIcon,                  label: 'لوحة التحكم' },
  { to: '/properties',    icon: BuildingOfficeIcon,         label: 'العقارات' },
  { to: '/clients',       icon: UsersIcon,                  label: 'العملاء' },
  { to: '/conversations', icon: ChatBubbleLeftRightIcon,    label: 'المحادثات' },
  { to: '/reports',       icon: ChartBarIcon,               label: 'التقارير' },
];

const roleLabels: Record<string, string> = {
  super_admin:     'سوبر ادمن',
  admin:           'مدير النظام',
  sales_manager:   'مدير المبيعات',
  sales_agent:     'موظف مبيعات',
  marketer:        'مسوّق',
  customer_service:'خدمة العملاء',
  viewer:          'مشاهد',
};

const roleBadge: Record<string, string> = {
  super_admin:     'bg-amber-500/20 text-amber-300 border border-amber-500/20',
  admin:           'bg-rose-500/20 text-rose-300 border border-rose-500/20',
  sales_manager:   'bg-violet-500/20 text-violet-300 border border-violet-500/20',
  sales_agent:     'bg-blue-500/20 text-blue-300 border border-blue-500/20',
  marketer:        'bg-orange-500/20 text-orange-300 border border-orange-500/20',
  customer_service:'bg-teal-500/20 text-teal-300 border border-teal-500/20',
  viewer:          'bg-gray-500/20 text-gray-400 border border-gray-500/20',
};

interface Props { open: boolean; onClose: () => void; }

export default function Sidebar({ open, onClose }: Props) {
  const user        = useAuthStore(s => s.user);
  const companyName = useCompanyStore(s => s.name_ar);
  const isManager   = ['admin','super_admin','sales_manager'].includes(user?.role ?? '');
  const initials    = (user?.full_name_ar ?? user?.full_name ?? 'م')[0];

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-20 lg:hidden" style={{ background: 'rgba(6,12,24,0.7)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      )}

      <aside className={`
        fixed lg:static inset-y-0 right-0 z-30 flex flex-col w-64
        transform transition-transform duration-300 ease-in-out
        ${open ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
      `} style={{
        background: 'linear-gradient(180deg, #060C18 0%, #090F1E 60%, #06101C 100%)',
        borderLeft: '1px solid rgba(200,168,75,0.1)',
      }}>

        {/* Subtle top glow */}
        <div style={{
          position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
          width: '160px', height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(200,168,75,0.4), transparent)',
        }} />

        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{
              background: 'linear-gradient(135deg, #A8892E 0%, #C8A84B 50%, #E2C670 100%)',
              boxShadow: '0 2px 12px rgba(200,168,75,0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
            }}>
              <BuildingOfficeIcon className="w-5 h-5" style={{ color: '#1a0f00' }} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight truncate" style={{ color: '#E8EDF5' }}>{companyName}</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'rgba(200,168,75,0.6)' }}>نظام إدارة عقاري ذكي</p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden p-1.5 rounded-lg transition-colors" style={{ color: '#7A8FAA' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#E8EDF5')}
            onMouseLeave={e => (e.currentTarget.style.color = '#7A8FAA')}>
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <p className="text-[10px] font-bold px-3 mb-3 tracking-widest uppercase" style={{ color: 'rgba(200,168,75,0.45)' }}>الرئيسية</p>

          {navMain.map(item => (
            <NavLink key={item.to} to={item.to} onClick={() => onClose()}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${isActive ? 'nav-item-active' : 'nav-item-inactive'}`
              }>
              {({ isActive }) => (
                <>
                  <item.icon style={{ width: '18px', height: '18px', flexShrink: 0, color: isActive ? '#1a0f00' : '#5A6882' }} />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}

          <div className="pt-5 pb-2">
            <div style={{ height: '1px', background: 'rgba(255,255,255,0.04)', margin: '0 12px 12px' }} />
            <p className="text-[10px] font-bold px-3 mb-2 tracking-widest uppercase" style={{ color: 'rgba(200,168,75,0.45)' }}>التكاملات</p>
          </div>

          <NavLink to="/whatsapp" onClick={() => onClose()}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${isActive ? 'nav-item-active' : 'nav-item-inactive'}`
            }>
            {({ isActive }) => (
              <>
                <DevicePhoneMobileIcon style={{ width: '18px', height: '18px', flexShrink: 0, color: isActive ? '#1a0f00' : '#22C55E' }} />
                <span>واتساب</span>
                <span className="mr-auto w-2 h-2 rounded-full animate-pulse" style={{ background: '#22C55E', boxShadow: '0 0 6px rgba(34,197,94,0.6)' }} />
              </>
            )}
          </NavLink>

          <NavLink to="/sheets" onClick={() => onClose()}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${isActive ? 'nav-item-active' : 'nav-item-inactive'}`
            }>
            {({ isActive }) => (
              <>
                <TableCellsIcon style={{ width: '18px', height: '18px', flexShrink: 0, color: isActive ? '#1a0f00' : '#34D399' }} />
                <span>استيراد Excel</span>
              </>
            )}
          </NavLink>

          {isManager && (
            <>
              <div className="pt-5 pb-2">
                <div style={{ height: '1px', background: 'rgba(255,255,255,0.04)', margin: '0 12px 12px' }} />
                <p className="text-[10px] font-bold px-3 mb-2 tracking-widest uppercase" style={{ color: 'rgba(200,168,75,0.45)' }}>الإدارة</p>
              </div>
              <NavLink to="/users" onClick={() => onClose()}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${isActive ? 'nav-item-active' : 'nav-item-inactive'}`
                }>
                {({ isActive }) => (
                  <>
                    <UserGroupIcon style={{ width: '18px', height: '18px', flexShrink: 0, color: isActive ? '#1a0f00' : '#5A6882' }} />
                    <span>المستخدمون</span>
                  </>
                )}
              </NavLink>
              <NavLink to="/settings" onClick={() => onClose()}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${isActive ? 'nav-item-active' : 'nav-item-inactive'}`
                }>
                {({ isActive }) => (
                  <>
                    <Cog6ToothIcon style={{ width: '18px', height: '18px', flexShrink: 0, color: isActive ? '#1a0f00' : '#5A6882' }} />
                    <span>إعدادات النظام</span>
                  </>
                )}
              </NavLink>
            </>
          )}
        </nav>

        {/* User Profile */}
        <div className="p-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="flex items-center gap-3 px-3 py-3 rounded-xl" style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold" style={{
              background: 'linear-gradient(135deg, #A8892E, #C8A84B)',
              color: '#1a0f00',
              boxShadow: '0 2px 8px rgba(200,168,75,0.3)',
            }}>
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate" style={{ color: '#E8EDF5' }}>{user?.full_name_ar ?? user?.full_name ?? 'المستخدم'}</p>
              <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mt-0.5 ${roleBadge[user?.role ?? ''] ?? 'bg-gray-500/20 text-gray-400'}`}>
                {roleLabels[user?.role ?? ''] ?? user?.role}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
