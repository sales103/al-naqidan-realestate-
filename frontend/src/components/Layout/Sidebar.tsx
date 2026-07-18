import { NavLink } from 'react-router-dom';
import {
  HomeIcon, BuildingOfficeIcon, UsersIcon,
  ChatBubbleLeftRightIcon, ChartBarIcon,
  XMarkIcon, TableCellsIcon, UserGroupIcon, ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import { useAuthStore } from '../../store/auth.store.ts';

const navItems = [
  { to: '/dashboard', icon: HomeIcon, label: 'لوحة التحكم' },
  { to: '/properties', icon: BuildingOfficeIcon, label: 'العقارات' },
  { to: '/clients', icon: UsersIcon, label: 'العملاء' },
  { to: '/conversations', icon: ChatBubbleLeftRightIcon, label: 'المحادثات' },
  { to: '/reports', icon: ChartBarIcon, label: 'التقارير' },
];

interface Props { open: boolean; onClose: () => void; }

export default function Sidebar({ open, onClose }: Props) {
  const user = useAuthStore((s) => s.user);

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/40 z-20 lg:hidden" onClick={onClose} />}
      <aside className={`fixed lg:static inset-y-0 right-0 z-30 flex flex-col w-64 bg-white border-l border-gray-200 shadow-xl lg:shadow-none transform transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <BuildingOfficeIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-xs font-bold text-blue-700 leading-none">Al-Naqidan</p>
              <p className="text-xs text-gray-500 mt-0.5">للاستثمارات العقارية</p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden text-gray-400 hover:text-gray-600">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : 'nav-item-inactive'}`}>
              <item.icon className="w-5 h-5 flex-shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}

          <div className="pt-3 pb-1">
            <p className="text-xs font-medium text-gray-400 px-3">التكاملات</p>
          </div>

          <NavLink to="/whatsapp" className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : 'nav-item-inactive'}`}>
            <span className="text-base leading-none w-5 text-center">📱</span>
            <span>واتساب</span>
          </NavLink>

          <NavLink to="/sheets" className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : 'nav-item-inactive'}`}>
            <TableCellsIcon className="w-5 h-5 flex-shrink-0 text-green-600" />
            <span>Google Sheets</span>
          </NavLink>

          {(user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'sales_manager') && (
            <>
              <div className="pt-3 pb-1">
                <p className="text-xs font-medium text-gray-400 px-3">الإدارة</p>
              </div>
              <NavLink to="/users" className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : 'nav-item-inactive'}`}>
                <UserGroupIcon className="w-5 h-5 flex-shrink-0" />
                <span>المستخدمون</span>
              </NavLink>
            </>
          )}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
            <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center">
              <span className="text-sm font-bold text-blue-700">{user?.full_name_ar?.charAt(0) ?? user?.full_name?.charAt(0) ?? 'م'}</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user?.full_name_ar ?? user?.full_name ?? 'المستخدم'}</p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}