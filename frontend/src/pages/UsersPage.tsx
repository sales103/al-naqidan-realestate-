import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UserPlusIcon, PencilSquareIcon, TrashIcon, CheckCircleIcon,
  XCircleIcon, DevicePhoneMobileIcon, ShieldCheckIcon, UserIcon,
} from '@heroicons/react/24/outline';
import { usersApi } from '../services/api.ts';
import toast from 'react-hot-toast';

const roleConfig: Record<string, { label: string; color: string; icon: typeof UserIcon }> = {
  super_admin: { label: 'سوبر ادمن', color: 'bg-rose-100 text-rose-700', icon: ShieldCheckIcon },
  admin: { label: 'مدير النظام', color: 'bg-red-100 text-red-700', icon: ShieldCheckIcon },
  sales_manager: { label: 'مدير مبيعات', color: 'bg-purple-100 text-purple-700', icon: ShieldCheckIcon },
  sales_agent: { label: 'موظف مبيعات', color: 'bg-blue-100 text-blue-700', icon: UserIcon },
  marketer: { label: 'مسوّق', color: 'bg-orange-100 text-orange-700', icon: UserIcon },
  customer_service: { label: 'خدمة عملاء', color: 'bg-teal-100 text-teal-700', icon: UserIcon },
  viewer: { label: 'مشاهد فقط', color: 'bg-gray-100 text-gray-600', icon: UserIcon },
};

const instanceOptions = [
  { value: '', label: '— بدون واتساب —' },
  { value: 'naqidan-whatsapp-1', label: 'واتساب رقم 1' },
  { value: 'naqidan-whatsapp-2', label: 'واتساب رقم 2' },
  { value: 'naqidan-whatsapp-3', label: 'واتساب رقم 3' },
];

const emptyForm = {
  full_name: '', full_name_ar: '', email: '', password: '',
  role: 'sales_agent', whatsapp_instance: '', is_active: true,
};

export default function UsersPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
  });

  const users: any[] = (data as any)?.data?.data ?? [];

  const createMut = useMutation({
    mutationFn: (d: any) => usersApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('تم إنشاء المستخدم ✓'); closeModal(); },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'حدث خطأ'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: string; d: any }) => usersApi.update(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('تم التحديث ✓'); closeModal(); },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'حدث خطأ'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => usersApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('تم تعطيل المستخدم'); setConfirmDelete(null); },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'حدث خطأ'),
  });

  const openCreate = () => { setEditing(null); setForm({ ...emptyForm }); setShowModal(true); };
  const openEdit = (u: any) => {
    setEditing(u);
    setForm({ full_name: u.full_name, full_name_ar: u.full_name_ar ?? '', email: u.email, password: '',
      role: u.role, whatsapp_instance: u.whatsapp_instance ?? '', is_active: u.is_active });
    setShowModal(true);
  };
  const closeModal = () => { setShowModal(false); setEditing(null); };

  const handleSubmit = () => {
    const payload: any = { ...form };
    if (!payload.password) delete payload.password;
    if (!payload.whatsapp_instance) payload.whatsapp_instance = null;
    if (editing) updateMut.mutate({ id: editing.id, d: payload });
    else createMut.mutate(payload);
  };

  const isBusy = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">إدارة المستخدمين</h2>
          <p className="text-sm text-gray-500 mt-1">{users.length} مستخدم</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">
          <UserPlusIcon className="w-4 h-4" />
          إضافة موظف
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100 text-gray-600">
                <tr>
                  <th className="px-4 py-3 text-right font-medium">الموظف</th>
                  <th className="px-4 py-3 text-right font-medium">البريد الإلكتروني</th>
                  <th className="px-4 py-3 text-right font-medium">الدور</th>
                  <th className="px-4 py-3 text-right font-medium">واتساب</th>
                  <th className="px-4 py-3 text-right font-medium">الحالة</th>
                  <th className="px-4 py-3 text-right font-medium">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-gray-400">
                      <UserIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p>لا يوجد مستخدمون بعد</p>
                    </td>
                  </tr>
                ) : users.map((u) => {
                  const role = roleConfig[u.role] ?? roleConfig.agent!;
                  const RoleIcon = role.icon;
                  const instance = instanceOptions.find(o => o.value === u.whatsapp_instance);
                  return (
                    <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                            {(u.full_name_ar || u.full_name || '?')[0]}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{u.full_name_ar || u.full_name}</p>
                            {u.full_name_ar && u.full_name !== u.full_name_ar && (
                              <p className="text-xs text-gray-400">{u.full_name}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${role.color}`}>
                          <RoleIcon className="w-3.5 h-3.5" />
                          {role.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {u.whatsapp_instance ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-600 text-xs font-medium">
                            <DevicePhoneMobileIcon className="w-4 h-4" />
                            {instance?.label ?? u.whatsapp_instance}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">غير مُخصص</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {u.is_active ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 text-xs">
                            <CheckCircleIcon className="w-4 h-4" /> نشط
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-gray-400 text-xs">
                            <XCircleIcon className="w-4 h-4" /> معطّل
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEdit(u)}
                            className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition" title="تعديل">
                            <PencilSquareIcon className="w-4 h-4" />
                          </button>
                          {u.is_active && (
                            <button onClick={() => setConfirmDelete(u.id)}
                              className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition" title="تعطيل">
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 text-lg">
                {editing ? 'تعديل المستخدم' : 'إضافة موظف جديد'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">الاسم بالعربي</label>
                  <input value={form.full_name_ar}
                    onChange={e => setForm(f => ({ ...f, full_name_ar: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="عبدالله النقيدان" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">الاسم بالإنجليزي</label>
                  <input value={form.full_name}
                    onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Abdullah Al-Naqidan" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">البريد الإلكتروني</label>
                <input type="email" value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="user@example.com" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  كلمة المرور {editing && <span className="text-gray-400">(اتركها فارغة للإبقاء على الحالية)</span>}
                </label>
                <input type="password" value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={editing ? '••••••••' : 'كلمة المرور'} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">الدور</label>
                  <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="sales_agent">موظف مبيعات</option>
                    <option value="sales_manager">مدير مبيعات</option>
                    <option value="customer_service">خدمة عملاء</option>
                    <option value="marketer">مسوّق</option>
                    <option value="admin">مدير النظام</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">رقم واتساب</label>
                  <select value={form.whatsapp_instance}
                    onChange={e => setForm(f => ({ ...f, whatsapp_instance: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {instanceOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              {editing && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.is_active}
                    onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                    className="w-4 h-4 rounded text-blue-600" />
                  <span className="text-sm text-gray-700">حساب نشط</span>
                </label>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
              <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">
                إلغاء
              </button>
              <button onClick={handleSubmit} disabled={isBusy || !form.full_name || !form.email || (!editing && !form.password)}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition flex items-center gap-2">
                {isBusy && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {editing ? 'حفظ التعديلات' : 'إنشاء الحساب'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm deactivate */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <XCircleIcon className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <h3 className="font-bold text-gray-900 mb-2">تعطيل المستخدم؟</h3>
            <p className="text-sm text-gray-500 mb-6">سيتم تعطيل حساب المستخدم ولن يتمكن من تسجيل الدخول.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">
                إلغاء
              </button>
              <button onClick={() => deleteMut.mutate(confirmDelete!)} disabled={deleteMut.isPending}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition">
                {deleteMut.isPending ? 'جارٍ...' : 'تعطيل'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
