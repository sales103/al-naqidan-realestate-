import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UserPlusIcon, PencilSquareIcon, TrashIcon,
  XCircleIcon, DevicePhoneMobileIcon, ShieldCheckIcon, UserIcon,
  XMarkIcon, UsersIcon, EnvelopeIcon,
} from '@heroicons/react/24/outline';
import { usersApi } from '../services/api.ts';
import { useAuthStore } from '../store/auth.store.ts';
import toast from 'react-hot-toast';

/* ── Role config ─────────────────────────────────────────────────────────── */
const roleConfig: Record<string, { label: string; bg: string; color: string; borderColor: string; icon: typeof UserIcon }> = {
  super_admin:     { label: 'سوبر ادمن',    bg: 'rgba(239,68,68,0.08)',    color: '#DC2626',  borderColor: 'rgba(239,68,68,0.2)',    icon: ShieldCheckIcon },
  admin:           { label: 'مدير النظام',  bg: 'rgba(239,68,68,0.06)',    color: '#EF4444',  borderColor: 'rgba(239,68,68,0.15)',   icon: ShieldCheckIcon },
  sales_manager:   { label: 'مدير مبيعات', bg: 'rgba(124,58,237,0.08)',   color: '#7C3AED',  borderColor: 'rgba(124,58,237,0.2)',   icon: ShieldCheckIcon },
  sales_agent:     { label: 'موظف مبيعات', bg: 'rgba(59,91,219,0.08)',    color: '#3B5BDB',  borderColor: 'rgba(59,91,219,0.18)',   icon: UserIcon },
  marketer:        { label: 'مسوّق',        bg: 'rgba(249,115,22,0.08)',   color: '#EA580C',  borderColor: 'rgba(249,115,22,0.2)',   icon: UserIcon },
  customer_service:{ label: 'خدمة عملاء',  bg: 'rgba(5,150,105,0.08)',    color: '#059669',  borderColor: 'rgba(5,150,105,0.18)',   icon: UserIcon },
  viewer:          { label: 'مشاهد فقط',   bg: 'rgba(100,116,139,0.07)',  color: '#64748B',  borderColor: 'rgba(100,116,139,0.15)', icon: UserIcon },
};

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #3B5BDB, #5273F5)',
  'linear-gradient(135deg, #7C3AED, #9B5CF6)',
  'linear-gradient(135deg, #059669, #34D399)',
  'linear-gradient(135deg, #A8892E, #C8A84B)',
  'linear-gradient(135deg, #EA580C, #FB923C)',
  'linear-gradient(135deg, #DC2626, #F87171)',
];
const avatarGradient = (name: string) =>
  AVATAR_GRADIENTS[name.charCodeAt(0) % AVATAR_GRADIENTS.length]!;

const instanceOptions = [
  { value: '',                   label: '— بدون واتساب —' },
  { value: 'naqidan-whatsapp-1', label: 'واتساب رقم 1' },
  { value: 'naqidan-whatsapp-2', label: 'واتساب رقم 2' },
  { value: 'naqidan-whatsapp-3', label: 'واتساب رقم 3' },
];

const emptyForm = {
  full_name: '', full_name_ar: '', email: '',
  role: 'sales_agent', whatsapp_instance: '', is_active: true,
};

/* ── Label ───────────────────────────────────────────────────────────────── */
function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-bold mb-1.5" style={{ color: '#5A6882' }}>{children}</label>;
}

/* ── Field ───────────────────────────────────────────────────────────────── */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label>{label}</Label>{children}</div>;
}

/* ── Input ───────────────────────────────────────────────────────────────── */
function Inp({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input w-full" {...props} />;
}

/* ── Main ────────────────────────────────────────────────────────────────── */
export default function UsersPage() {
  const qc = useQueryClient();
  const { user: me } = useAuthStore();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [confirmDelete, setConfirmDelete] = useState<any>(null);
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const { data: usersRes, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => usersApi.list() });
  const allUsers: any[] = (usersRes as any)?.data?.data ?? [];
  const activeUsers = allUsers.filter((u: any) => u.is_active);
  const pendingUsers = allUsers.filter((u: any) => !u.is_active);

  const createMut = useMutation({
    mutationFn: (d: any) => usersApi.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('تم إنشاء المستخدم وإرسال رابط تعيين كلمة المرور إلى بريد الموظف'); closeModal(); },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'حدث خطأ'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: string; d: any }) => usersApi.update(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('تم تحديث الحساب'); closeModal(); },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'حدث خطأ'),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => usersApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('تم تعطيل الحساب'); setConfirmDelete(null); },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'حدث خطأ'),
  });
  const resendMut = useMutation({
    mutationFn: (id: string) => usersApi.resendInvite(id),
    onSuccess: () => toast.success('تم إعادة إرسال رابط الدعوة'),
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'حدث خطأ'),
  });

  const openCreate = () => { setEditing(null); setForm({ ...emptyForm }); setShowModal(true); };
  const openEdit   = (u: any) => {
    setEditing(u);
    setForm({ full_name: u.full_name, full_name_ar: u.full_name_ar ?? '',
      email: u.email, role: u.role,
      whatsapp_instance: u.whatsapp_instance ?? '', is_active: u.is_active });
    setShowModal(true);
  };
  const closeModal = () => { setShowModal(false); setEditing(null); };

  const handleSubmit = () => {
    if (!form.full_name.trim() && !form.full_name_ar.trim()) { toast.error('أدخل اسم الموظف'); return; }
    if (!form.email.trim()) { toast.error('أدخل البريد الإلكتروني'); return; }
    const payload: any = { ...form };
    if (!payload.whatsapp_instance) payload.whatsapp_instance = null;
    if (!payload.full_name) payload.full_name = payload.full_name_ar;
    if (editing) updateMut.mutate({ id: editing.id, d: payload });
    else createMut.mutate(payload);
  };

  const isBusy     = createMut.isPending || updateMut.isPending;
  const canManage  = me?.role === 'super_admin' || me?.role === 'admin';
  const isSuperAdmin = me?.role === 'super_admin';

  /* role stats */
  const roleCounts = activeUsers.reduce<Record<string, number>>((acc, u) => {
    acc[u.role] = (acc[u.role] ?? 0) + 1; return acc;
  }, {});

  return (
    <div className="space-y-6">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="page-title">إدارة المستخدمين</h2>
          <p className="page-sub">الفريق، الأدوار، وصلاحيات الوصول</p>
        </div>
        {canManage && (
          <button onClick={openCreate}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
            style={{ background: 'linear-gradient(135deg, #3B5BDB, #5273F5)', boxShadow: '0 2px 10px rgba(59,91,219,0.35)' }}
            onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 18px rgba(59,91,219,0.45)')}
            onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 2px 10px rgba(59,91,219,0.35)')}>
            <UserPlusIcon className="w-4 h-4" />
            إضافة موظف
          </button>
        )}
      </div>

      {/* ── Stats Strip ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'إجمالي الموظفين', value: activeUsers.length,     color: '#3B5BDB', bg: 'rgba(59,91,219,0.07)'  },
          { label: 'بانتظار التفعيل',  value: pendingUsers.length,    color: '#F59E0B', bg: 'rgba(245,158,11,0.08)' },
          { label: 'مديرون',          value: (roleCounts['admin'] ?? 0) + (roleCounts['sales_manager'] ?? 0), color: '#7C3AED', bg: 'rgba(124,58,237,0.07)' },
          { label: 'موظفو مبيعات',    value: roleCounts['sales_agent'] ?? 0, color: '#059669', bg: 'rgba(5,150,105,0.07)' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4 flex items-center gap-3" style={{ background: s.bg, border: `1px solid ${s.color}18` }}>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${s.color}15` }}>
              <UsersIcon className="w-4 h-4" style={{ color: s.color }} />
            </div>
            <div>
              <p className="text-xl font-bold leading-none" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs mt-0.5" style={{ color: '#7A8FAA' }}>{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Users Table ──────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-3 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-2xl h-16" style={{ background: 'rgba(59,91,219,0.04)', border: '1px solid rgba(59,91,219,0.06)' }} />
          ))}
        </div>
      ) : allUsers.length === 0 ? (
        <div className="rounded-2xl py-20 text-center" style={{ background: '#fff', border: '1px solid rgba(59,91,219,0.08)' }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(59,91,219,0.06)' }}>
            <UserIcon className="w-8 h-8" style={{ color: '#C4CEDE' }} />
          </div>
          <p className="font-bold" style={{ color: '#0F1C35' }}>لا يوجد موظفون بعد</p>
          <p className="text-sm mt-1" style={{ color: '#7A8FAA' }}>ابدأ بإضافة أول موظف في فريقك</p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid rgba(59,91,219,0.08)', boxShadow: '0 1px 4px rgba(6,12,24,0.05)' }}>
          <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: '640px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(59,91,219,0.06)', background: 'rgba(242,246,255,0.6)' }}>
                {['الموظف', 'البريد الإلكتروني', 'الدور', 'الحالة', 'واتساب', ''].map((h, i) => (
                  <th key={i} className="px-5 py-3.5 text-right text-xs font-bold tracking-wide" style={{ color: '#7A8FAA' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allUsers.map((u, idx) => {
                const role     = roleConfig[u.role] ?? roleConfig['sales_agent']!;
                const RoleIcon = role.icon;
                const name     = u.full_name_ar || u.full_name || '?';
                const instance = instanceOptions.find(o => o.value === u.whatsapp_instance);
                const isLast   = idx === allUsers.length - 1;
                const isPending = !u.is_active;
                return (
                  <tr key={u.id} style={{ borderBottom: isLast ? 'none' : '1px solid rgba(59,91,219,0.05)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,91,219,0.025)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                          style={{ background: isPending ? 'linear-gradient(135deg, #94A3B8, #CBD5E1)' : avatarGradient(name) }}>
                          {name[0]}
                        </div>
                        <div>
                          <p className="font-semibold" style={{ color: '#0F1C35' }}>{name}</p>
                          {u.full_name_ar && u.full_name && u.full_name !== u.full_name_ar && (
                            <p className="text-xs" style={{ color: '#94A3B8' }}>{u.full_name}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4" style={{ color: '#5A6882' }}>{u.email}</td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                        style={{ background: role.bg, color: role.color, border: `1px solid ${role.borderColor}` }}>
                        <RoleIcon className="w-3.5 h-3.5" />
                        {role.label}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {isPending ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
                          style={{ background: 'rgba(245,158,11,0.08)', color: '#D97706', border: '1px solid rgba(245,158,11,0.15)' }}>
                          بانتظار التفعيل
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
                          style={{ background: 'rgba(5,150,105,0.08)', color: '#059669', border: '1px solid rgba(5,150,105,0.15)' }}>
                          نشط
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {u.whatsapp_instance ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full"
                          style={{ background: 'rgba(5,150,105,0.08)', color: '#059669', border: '1px solid rgba(5,150,105,0.15)' }}>
                          <DevicePhoneMobileIcon className="w-3.5 h-3.5" />
                          {instance?.label ?? u.whatsapp_instance}
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: '#C4CEDE' }}>غير مُخصص</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {canManage && (
                        <div className="flex items-center gap-1.5 justify-end">
                          {isPending && (
                            <button onClick={() => resendMut.mutate(u.id)}
                              disabled={resendMut.isPending}
                              className="p-2 rounded-lg transition-all"
                              title="إعادة إرسال الدعوة"
                              style={{ color: '#7A8FAA' }}
                              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(245,158,11,0.08)'; (e.currentTarget as HTMLButtonElement).style.color = '#D97706'; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#7A8FAA'; }}>
                              <EnvelopeIcon className="w-4 h-4" />
                            </button>
                          )}
                          <button onClick={() => openEdit(u)}
                            className="p-2 rounded-lg transition-all"
                            title="تعديل"
                            style={{ color: '#7A8FAA' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(59,91,219,0.08)'; (e.currentTarget as HTMLButtonElement).style.color = '#3B5BDB'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#7A8FAA'; }}>
                            <PencilSquareIcon className="w-4 h-4" />
                          </button>
                          {u.id !== me?.id && (
                            <button onClick={() => setConfirmDelete(u)}
                              className="p-2 rounded-lg transition-all"
                              title="تعطيل"
                              style={{ color: '#7A8FAA' }}
                              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.07)'; (e.currentTarget as HTMLButtonElement).style.color = '#DC2626'; }}
                              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#7A8FAA'; }}>
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* ── Create / Edit Modal ───────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(6,12,24,0.65)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto fade-in" style={{ background: '#fff', borderRadius: '20px', boxShadow: '0 24px 64px rgba(6,12,24,0.25)', border: '1px solid rgba(59,91,219,0.1)' }}>

            {/* Modal Header */}
            <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(59,91,219,0.07)' }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: editing ? 'rgba(59,91,219,0.08)' : 'rgba(5,150,105,0.08)' }}>
                  {editing ? <PencilSquareIcon className="w-5 h-5" style={{ color: '#3B5BDB' }} />
                            : <UserPlusIcon    className="w-5 h-5" style={{ color: '#059669' }} />}
                </div>
                <h3 className="font-bold text-base" style={{ color: '#0F1C35' }}>
                  {editing ? 'تعديل بيانات الموظف' : 'إضافة موظف جديد'}
                </h3>
              </div>
              <button onClick={closeModal} className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                style={{ color: '#94A3B8' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(59,91,219,0.07)'; (e.currentTarget as HTMLButtonElement).style.color = '#3B5BDB'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#94A3B8'; }}>
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {editing && (
                <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(59,91,219,0.05)', border: '1px solid rgba(59,91,219,0.1)' }}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                    style={{ background: avatarGradient(editing.full_name_ar || editing.full_name || '?') }}>
                    {(editing.full_name_ar || editing.full_name || '?')[0]}
                  </div>
                  <div>
                    <p className="text-sm font-bold" style={{ color: '#0F1C35' }}>{editing.full_name_ar || editing.full_name}</p>
                    <p className="text-xs" style={{ color: '#7A8FAA' }}>{editing.email}</p>
                  </div>
                </div>
              )}

              {!editing && (
                <div className="p-3 rounded-xl" style={{ background: 'rgba(59,91,219,0.04)', border: '1px solid rgba(59,91,219,0.08)' }}>
                  <p className="text-xs" style={{ color: '#5A6882' }}>
                    سيتم إرسال رابط تعيين كلمة المرور تلقائيا إلى بريد الموظف
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="الاسم بالعربي">
                  <Inp value={form.full_name_ar} onChange={e => set('full_name_ar', e.target.value)} placeholder="محمد العلي" />
                </Field>
                <Field label="الاسم بالإنجليزي">
                  <Inp value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Mohammed Al-Ali" dir="ltr" />
                </Field>
              </div>

              <Field label="البريد الإلكتروني">
                <Inp type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="user@example.com" dir="ltr" />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="الدور الوظيفي">
                  <select value={form.role} onChange={e => set('role', e.target.value)} className="input w-full">
                    {isSuperAdmin && <option value="super_admin">سوبر ادمن</option>}
                    <option value="admin">مدير النظام</option>
                    <option value="sales_manager">مدير مبيعات</option>
                    <option value="sales_agent">موظف مبيعات</option>
                    <option value="customer_service">خدمة عملاء</option>
                    <option value="marketer">مسوّق</option>
                    <option value="viewer">مشاهد فقط</option>
                  </select>
                </Field>
                <Field label="خط واتساب">
                  <select value={form.whatsapp_instance} onChange={e => set('whatsapp_instance', e.target.value)} className="input w-full">
                    {instanceOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>
              </div>

              {editing && (
                <div className="flex items-center justify-between p-4 rounded-xl" style={{ background: form.is_active ? 'rgba(5,150,105,0.05)' : 'rgba(239,68,68,0.05)', border: `1px solid ${form.is_active ? 'rgba(5,150,105,0.12)' : 'rgba(239,68,68,0.12)'}` }}>
                  <div>
                    <p className="text-sm font-bold" style={{ color: '#0F1C35' }}>حالة الحساب</p>
                    <p className="text-xs mt-0.5" style={{ color: '#7A8FAA' }}>{form.is_active ? 'الحساب نشط ويمكن للموظف تسجيل الدخول' : 'الحساب معطّل'}</p>
                  </div>
                  <button type="button" onClick={() => set('is_active', !form.is_active)}
                    className="relative flex-shrink-0 transition-all duration-300"
                    style={{ width: '48px', height: '26px', borderRadius: '999px', background: form.is_active ? 'linear-gradient(135deg, #059669, #34D399)' : '#D1D9EC', boxShadow: form.is_active ? '0 2px 8px rgba(5,150,105,0.35)' : 'none' }}>
                    <span style={{ position: 'absolute', top: '3px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'all 0.25s ease', right: form.is_active ? '3px' : 'calc(100% - 23px)' }} />
                  </button>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 flex gap-3 justify-end" style={{ borderTop: '1px solid rgba(59,91,219,0.07)' }}>
              <button onClick={closeModal}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{ color: '#5A6882' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,91,219,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                إلغاء
              </button>
              <button onClick={handleSubmit} disabled={isBusy}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #3B5BDB, #5273F5)', boxShadow: '0 2px 10px rgba(59,91,219,0.35)' }}>
                {isBusy && <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
                {editing ? 'حفظ التعديلات' : 'إنشاء وإرسال الدعوة'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Deactivate ────────────────────────────────────────────── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(6,12,24,0.65)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-sm fade-in text-center p-8" style={{ background: '#fff', borderRadius: '20px', boxShadow: '0 24px 64px rgba(6,12,24,0.25)' }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <XCircleIcon className="w-7 h-7" style={{ color: '#DC2626' }} />
            </div>
            <h3 className="font-bold text-lg mb-2" style={{ color: '#0F1C35' }}>تعطيل الحساب؟</h3>
            <p className="text-sm mb-1" style={{ color: '#5A6882' }}>
              سيتم تعطيل حساب <strong style={{ color: '#0F1C35' }}>{confirmDelete.full_name_ar || confirmDelete.full_name}</strong>
            </p>
            <p className="text-xs mb-7" style={{ color: '#94A3B8' }}>لن يتمكن من تسجيل الدخول حتى يتم تفعيل حسابه مجدداً</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setConfirmDelete(null)}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{ color: '#5A6882' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,91,219,0.05)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                إلغاء
              </button>
              <button onClick={() => deleteMut.mutate(confirmDelete.id)} disabled={deleteMut.isPending}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #DC2626, #EF4444)', boxShadow: '0 2px 8px rgba(239,68,68,0.3)' }}>
                {deleteMut.isPending && <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
                تعطيل الحساب
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
