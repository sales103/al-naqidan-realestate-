import { useState } from 'react';
import {
  UserCircleIcon, LockClosedIcon, CheckIcon,
  EyeIcon, EyeSlashIcon, EnvelopeIcon, PhoneIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { authApi } from '../services/api.ts';
import { useAuthStore } from '../store/auth.store.ts';

/* ── Section Card ───────────────────────────────────────────────────────────── */
function Section({ num, title, color, children }: { num: number; title: string; color: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{
      background: '#fff',
      border: '1px solid rgba(59,91,219,0.08)',
      boxShadow: '0 1px 4px rgba(6,12,24,0.05)',
    }}>
      <div className="px-6 py-4 flex items-center gap-3" style={{
        borderBottom: '1px solid rgba(59,91,219,0.06)',
        background: 'rgba(242,246,255,0.5)',
      }}>
        <span className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
          style={{ background: color, boxShadow: `0 2px 8px ${color}55` }}>
          {num}
        </span>
        <span className="font-bold text-sm" style={{ color: '#0F1C35' }}>{title}</span>
      </div>
      <div className="p-6 space-y-4">{children}</div>
    </div>
  );
}

/* ── Save Button ────────────────────────────────────────────────────────────── */
function SaveBtn({ pending, label, onClick }: { pending: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={pending}
      className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold rounded-xl transition-all duration-200 disabled:opacity-60"
      style={{
        background: 'linear-gradient(135deg, #3B5BDB, #5273F5)',
        color: '#fff',
        boxShadow: '0 2px 10px rgba(59,91,219,0.35)',
      }}
      onMouseEnter={e => { if (!pending) (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 18px rgba(59,91,219,0.45)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 2px 10px rgba(59,91,219,0.35)'; }}>
      {pending
        ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>جاري الحفظ...</>
        : <><CheckIcon className="w-4 h-4" />{label}</>
      }
    </button>
  );
}

/* ── Main Page ──────────────────────────────────────────────────────────────── */
export default function ProfilePage() {
  const { user, updateUser } = useAuthStore();

  // Profile form
  const [form, setForm] = useState({
    full_name: user?.full_name ?? '',
    full_name_ar: user?.full_name_ar ?? '',
    email: user?.email ?? '',
    phone: (user as any)?.phone ?? '',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  // Password form
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [savingPw, setSavingPw] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const setPw = (k: string, v: string) => setPwForm(f => ({ ...f, [k]: v }));

  const initials = (user?.full_name_ar ?? user?.full_name ?? '?')[0];

  const handleSaveProfile = async () => {
    if (!form.full_name.trim()) { toast.error('الاسم بالانجليزية مطلوب'); return; }
    if (!form.email.trim()) { toast.error('البريد الإلكتروني مطلوب'); return; }
    setSavingProfile(true);
    try {
      const res = await authApi.updateProfile({
        full_name: form.full_name,
        full_name_ar: form.full_name_ar || undefined,
        email: form.email,
        phone: form.phone || undefined,
      });
      const updated = (res as any).data?.data;
      if (updated) {
        updateUser({
          full_name: updated.full_name,
          full_name_ar: updated.full_name_ar,
          email: updated.email,
          avatar_url: updated.avatar_url,
        });
      }
      toast.success('تم تحديث البيانات الشخصية بنجاح');
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'فشل تحديث البيانات');
    } finally { setSavingProfile(false); }
  };

  const handleChangePassword = async () => {
    if (!pwForm.current_password) { toast.error('أدخل كلمة المرور الحالية'); return; }
    if (!pwForm.new_password) { toast.error('أدخل كلمة المرور الجديدة'); return; }
    if (pwForm.new_password.length < 8) { toast.error('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل'); return; }
    if (pwForm.new_password !== pwForm.confirm_password) { toast.error('كلمة المرور الجديدة غير متطابقة'); return; }
    setSavingPw(true);
    try {
      await authApi.changePassword({
        current_password: pwForm.current_password,
        new_password: pwForm.new_password,
      });
      toast.success('تم تغيير كلمة المرور بنجاح');
      setPwForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'فشل تغيير كلمة المرور');
    } finally { setSavingPw(false); }
  };

  const roleLabels: Record<string, string> = {
    super_admin: 'مدير النظام',
    admin: 'مدير',
    sales_manager: 'مدير مبيعات',
    sales_agent: 'موظف مبيعات',
    marketer: 'مسوق',
    customer_service: 'خدمة عملاء',
    viewer: 'مشاهد',
  };

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h2 className="page-title">حسابي</h2>
        <p className="page-sub">إدارة البيانات الشخصية وكلمة المرور</p>
      </div>

      {/* Avatar / Identity Card */}
      <div className="rounded-2xl overflow-hidden" style={{
        background: 'linear-gradient(135deg, #060C18, #0B1525)',
        border: '1px solid rgba(59,91,219,0.12)',
      }}>
        <div className="p-6 flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold flex-shrink-0" style={{
            background: 'linear-gradient(135deg, #A8892E, #C8A84B)',
            color: '#1a0f00',
            boxShadow: '0 4px 16px rgba(200,168,75,0.35)',
          }}>
            {user?.avatar_url
              ? <img src={user.avatar_url} alt="" className="w-full h-full rounded-2xl object-cover" />
              : initials
            }
          </div>
          <div>
            <p className="font-bold text-lg" style={{ color: '#E8EDF5' }}>
              {user?.full_name_ar ?? user?.full_name}
            </p>
            <p className="text-sm mt-0.5" style={{ color: 'rgba(200,168,75,0.7)' }}>
              {roleLabels[user?.role ?? ''] ?? user?.role}
            </p>
            <p className="text-xs mt-1" style={{ color: 'rgba(200,200,220,0.5)' }}>
              {user?.email}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-5 max-w-2xl">

        {/* Section 1: Personal Info */}
        <Section num={1} title="البيانات الشخصية" color="#3B5BDB">
          <div>
            <label className="label flex items-center gap-1.5">
              <UserIcon className="w-3.5 h-3.5" style={{ color: '#7A8FAA' }} />
              الاسم بالانجليزية
            </label>
            <input value={form.full_name} onChange={e => set('full_name', e.target.value)}
              className="input" placeholder="Full Name" dir="ltr" />
          </div>
          <div>
            <label className="label flex items-center gap-1.5">
              <UserIcon className="w-3.5 h-3.5" style={{ color: '#7A8FAA' }} />
              الاسم بالعربية
            </label>
            <input value={form.full_name_ar} onChange={e => set('full_name_ar', e.target.value)}
              className="input" placeholder="الاسم الكامل" />
          </div>
          <div>
            <label className="label flex items-center gap-1.5">
              <EnvelopeIcon className="w-3.5 h-3.5" style={{ color: '#7A8FAA' }} />
              البريد الإلكتروني
            </label>
            <input value={form.email} onChange={e => set('email', e.target.value)}
              className="input" placeholder="email@example.com" dir="ltr" type="email" />
          </div>
          <div>
            <label className="label flex items-center gap-1.5">
              <PhoneIcon className="w-3.5 h-3.5" style={{ color: '#7A8FAA' }} />
              رقم الهاتف
            </label>
            <input value={form.phone} onChange={e => set('phone', e.target.value)}
              className="input" placeholder="+966 5X XXX XXXX" dir="ltr" />
          </div>

          <SaveBtn pending={savingProfile} label="حفظ البيانات" onClick={handleSaveProfile} />
        </Section>

        {/* Section 2: Change Password */}
        <Section num={2} title="تغيير كلمة المرور" color="#7C3AED">
          <div>
            <label className="label flex items-center gap-1.5">
              <LockClosedIcon className="w-3.5 h-3.5" style={{ color: '#7A8FAA' }} />
              كلمة المرور الحالية
            </label>
            <div className="relative">
              <input value={pwForm.current_password} onChange={e => setPw('current_password', e.target.value)}
                type={showCurrent ? 'text' : 'password'} className="input pl-10" placeholder="ادخل كلمة المرور الحالية" dir="ltr" />
              <button type="button" onClick={() => setShowCurrent(!showCurrent)}
                className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#94A3B8' }}>
                {showCurrent ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="label flex items-center gap-1.5">
              <LockClosedIcon className="w-3.5 h-3.5" style={{ color: '#7A8FAA' }} />
              كلمة المرور الجديدة
            </label>
            <div className="relative">
              <input value={pwForm.new_password} onChange={e => setPw('new_password', e.target.value)}
                type={showNew ? 'text' : 'password'} className="input pl-10" placeholder="8 أحرف على الأقل مع حروف كبيرة وصغيرة وأرقام" dir="ltr" />
              <button type="button" onClick={() => setShowNew(!showNew)}
                className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#94A3B8' }}>
                {showNew ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="label flex items-center gap-1.5">
              <LockClosedIcon className="w-3.5 h-3.5" style={{ color: '#7A8FAA' }} />
              تأكيد كلمة المرور الجديدة
            </label>
            <input value={pwForm.confirm_password} onChange={e => setPw('confirm_password', e.target.value)}
              type="password" className="input" placeholder="أعد إدخال كلمة المرور الجديدة" dir="ltr" />
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-xl text-sm" style={{
            background: 'rgba(124,58,237,0.05)', border: '1px solid rgba(124,58,237,0.12)',
          }}>
            <LockClosedIcon className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#7C3AED' }} />
            <p style={{ color: '#5A6882' }}>
              كلمة المرور يجب أن تحتوي على 8 أحرف على الأقل، مع حروف كبيرة وصغيرة وأرقام
            </p>
          </div>

          <SaveBtn pending={savingPw} label="تغيير كلمة المرور" onClick={handleChangePassword} />
        </Section>

      </div>
    </div>
  );
}
