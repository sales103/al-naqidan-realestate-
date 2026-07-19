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
  super_admin:   'bg-rose-500/20 text-rose-300',
  admin:         'bg-red-500/20 text-red-300',
  sales_manager: 'bg-purple-500/20 text-purple-300',
  sales_agent:   'bg-blue-500/20 text-blue-300',
  marketer:      'bg-orange-500/20 text-orange-300',
  customer_service:'bg-teal-500/20 text-teal-300',
  viewer:        'bg-gray-500/20 text-gray-400',
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-20 lg:hidden" onClick={onClose} />
      )}

      <aside className={`
        fixed lg:static inset-y-0 right-0 z-30 flex flex-col w-64
        bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800
        border-l border-slate-700/50
        transform transition-transform duration-300 ease-in-out
        ${open ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}
      `}>

        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-slate-700/50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-900/40">
              <BuildingOfficeIcon className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white leading-tight truncate">{companyName}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">نظام إدارة عقاري ذكي</p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700/50 transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-3 mb-2">الرئيسية</p>

          {navMain.map(item => (
            <NavLink key={item.to} to={item.to} onClick={() => onClose()}
              className={({ isActive }) => `
                flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150
                ${isActive
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }
              `}>
              {({ isActive }) => (
                <>
                  <item.icon className={`w-4.5 h-4.5 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} style={{ width: '18px', height: '18px' }} />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}

          <div className="pt-4 pb-2">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-3 mb-2">التكاملات</p>
          </div>

          <NavLink to="/whatsapp" onClick={() => onClose()}
            className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${isActive ? 'bg-green-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}>
            {({ isActive }) => (
              <>
                <DevicePhoneMobileIcon style={{ width: '18px', height: '18px' }} className={`flex-shrink-0 ${isActive ? 'text-white' : 'text-green-500'}`} />
                <span>واتساب</span>
                <span className="mr-auto w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              </>
            )}
          </NavLink>

          <NavLink to="/sheets" onClick={() => onClose()}
            className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${isActive ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}>
            <TableCellsIcon style={{ width: '18px', height: '18px' }} className="flex-shrink-0 text-emerald-500" />
            <span>Google Sheets</span>
          </NavLink>

          {isManager && (
            <>
              <div className="pt-4 pb-2">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-3 mb-2">الإدارة</p>
              </div>
              <NavLink to="/users" onClick={() => onClose()}
                className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${isActive ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}>
                <UserGroupIcon style={{ width: '18px', height: '18px' }} className="flex-shrink-0" />
                <span>المستخدمون</span>
              </NavLink>
              <NavLink to="/settings" onClick={() => onClose()}
                className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${isActive ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}>
                <Cog6ToothIcon style={{ width: '18px', height: '18px' }} className="flex-shrink-0" />
                <span>إعدادات النظام</span>
              </NavLink>
            </>
          )}
        </nav>

        {/* User Profile */}
        <div className="p-3 border-t border-slate-700/50">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700/40">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 text-sm font-bold text-white">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white truncate">{user?.full_name_ar ?? user?.full_name ?? 'المستخدم'}</p>
              <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full mt-0.5 ${roleBadge[user?.role ?? ''] ?? 'bg-gray-500/20 text-gray-400'}`}>
                {roleLabels[user?.role ?? ''] ?? user?.role}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}