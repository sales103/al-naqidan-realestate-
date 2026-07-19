import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  EnvelopeIcon, CheckCircleIcon, ExclamationCircleIcon,
  EyeIcon, EyeSlashIcon, Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { settingsApi, api } from '../services/api.ts';
import { useAuthStore } from '../store/auth.store.ts';

const TABS = [
  { id: 'email', label: 'البريد الإلكتروني', icon: EnvelopeIcon },
  { id: 'company', label: 'بيانات الشركة', icon: Cog6ToothIcon },
] as const;

type Tab = typeof TABS[number]['id'];

// ── Email Settings ─────────────────────────────────────────────────────────
function EmailSettings() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    host: '', port: '587', user: '', password: '', from: '', from_name: '',
  });
  const [showPass, setShowPass] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'smtp'],
    queryFn: () => settingsApi.get('smtp'),
  });

  useEffect(() => {
    const v = (data as any)?.data?.data;
    if (v) {
      setForm({
        host:      v.host      ?? 'smtp.gmail.com',
        port:      String(v.port ?? 587),
        user:      v.user      ?? '',
        password:  '',             // never pre-fill password
        from:      v.from      ?? '',
        from_name: v.from_name ?? '',
      });
    }
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () => settingsApi.save('smtp', {
      host: form.host, port: Number(form.port),
      user: form.user,
      ...(form.password && form.password !== '••••••••' ? { password: form.password } : {}),
      from: form.from || form.user,
      from_name: form.from_name || 'النظام',
    }),
    onSuccess: () => { toast.success('تم حفظ إعدادات البريد'); qc.invalidateQueries({ queryKey: ['settings'] }); },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'فشل الحفظ'),
  });

  const testEmail = async () => {
    if (!form.user) { toast.error('أدخل البريد الإلكتروني أولاً'); return; }
    setTesting(true);
    setTestResult(null);
    try {
      await api.post('/settings/test-email', { to: form.user });
      setTestResult({ ok: true, msg: 'تم إرسال بريد تجريبي — تحقق من صندوقك' });
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.response?.data?.error ?? 'فشل الإرسال' });
    } finally { setTesting(false); }
  };

  if (isLoading) return <div className="p-8 text-center text-gray-400">جاري التحميل...</div>;

  const presets = [
    { label: 'Gmail', host: 'smtp.gmail.com', port: '587' },
    { label: 'Outlook', host: 'smtp.office365.com', port: '587' },
    { label: 'Yahoo', host: 'smtp.mail.yahoo.com', port: '465' },
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        <p className="font-semibold mb-1">كيف يعمل البريد؟</p>
        <p>النظام يستخدم هذه الإعدادات لإرسال رموز التحقق عند تسجيل موظفين جدد أو إعادة تعيين كلمة المرور. لا علاقة لأي بريد خارجي بهذا الأمر — كل شيء من حسابك أنت.</p>
      </div>

      {/* Quick presets */}
      <div>
        <p className="text-sm text-gray-500 mb-2">اختر مزود البريد:</p>
        <div className="flex gap-2 flex-wrap">
          {presets.map(p => (
            <button key={p.label} onClick={() => { set('host', p.host); set('port', p.port); }}
              className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${form.host === p.host ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:border-blue-400'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Form */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className="label">SMTP Host (السيرفر)</label>
            <input value={form.host} onChange={e => set('host', e.target.value)}
              className="input" placeholder="smtp.gmail.com" dir="ltr" />
          </div>
          <div>
            <label className="label">Port (المنفذ)</label>
            <input value={form.port} onChange={e => set('port', e.target.value)}
              className="input" placeholder="587" dir="ltr" type="number" />
          </div>
        </div>

        <div>
          <label className="label">البريد الإلكتروني</label>
          <input value={form.user} onChange={e => set('user', e.target.value)}
            className="input" placeholder="info@company.com" dir="ltr" type="email" />
        </div>

        <div>
          <label className="label">كلمة المرور (App Password)</label>
          <div className="relative">
            <input value={form.password} onChange={e => set('password', e.target.value)}
              type={showPass ? 'text' : 'password'} className="input pl-10"
              placeholder="اتركه فارغاً إذا لم تريد تغييره" dir="ltr" />
            <button type="button" onClick={() => setShowPass(!showPass)}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showPass ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">لـ Gmail: أنشئ App Password من إعدادات حساب Google</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">بريد الإرسال (From)</label>
            <input value={form.from} onChange={e => set('from', e.target.value)}
              className="input" placeholder="مثل البريد أعلاه" dir="ltr" type="email" />
          </div>
          <div>
            <label className="label">اسم المرسل</label>
            <input value={form.from_name} onChange={e => set('from_name', e.target.value)}
              className="input" placeholder="شركة النقيدان العقارية" />
          </div>
        </div>

        {/* Test result */}
        {testResult && (
          <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${testResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {testResult.ok
              ? <CheckCircleIcon className="w-5 h-5 flex-shrink-0" />
              : <ExclamationCircleIcon className="w-5 h-5 flex-shrink-0" />}
            {testResult.msg}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-60">
            {saveMut.isPending ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
          </button>
          <button onClick={testEmail} disabled={testing}
            className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors disabled:opacity-60">
            {testing ? 'جاري الإرسال...' : 'إرسال بريد تجريبي'}
          </button>
        </div>
      </div>

      {/* Gmail guide */}
      {form.host === 'smtp.gmail.com' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 space-y-2">
          <p className="font-semibold">خطوات الحصول على Gmail App Password:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>اذهب إلى <span className="font-mono bg-amber-100 px-1 rounded">myaccount.google.com</span></li>
            <li>الأمان ← التحقق بخطوتين ← فعّله</li>
            <li>ابحث عن "App passwords" أو "كلمات مرور التطبيقات"</li>
            <li>اختر Other واكتب اسماً مثل "نظام العقارات"</li>
            <li>انسخ الـ 16 حرف التي ستظهر والصقها في حقل كلمة المرور أعلاه</li>
          </ol>
        </div>
      )}
    </div>
  );
}

// ── Company Settings ───────────────────────────────────────────────────────
function CompanySettings() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', name_ar: '', phone: '', address: '', website: '' });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const { data } = useQuery({
    queryKey: ['settings', 'company'],
    queryFn: () => settingsApi.get('company'),
  });

  useEffect(() => {
    const v = (data as any)?.data?.data;
    if (v) setForm({ name: v.name ?? '', name_ar: v.name_ar ?? '', phone: v.phone ?? '', address: v.address ?? '', website: v.website ?? '' });
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () => settingsApi.save('company', form),
    onSuccess: () => { toast.success('تم حفظ بيانات الشركة'); qc.invalidateQueries({ queryKey: ['settings'] }); },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'فشل الحفظ'),
  });

  return (
    <div className="max-w-2xl">
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">اسم الشركة (عربي)</label>
            <input value={form.name_ar} onChange={e => set('name_ar', e.target.value)} className="input" placeholder="شركة النقيدان للعقارات" />
          </div>
          <div>
            <label className="label">Company Name (English)</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} className="input" placeholder="Al-Naqidan Real Estate" dir="ltr" />
          </div>
        </div>
        <div>
          <label className="label">رقم الهاتف</label>
          <input value={form.phone} onChange={e => set('phone', e.target.value)} className="input" placeholder="+966 5X XXX XXXX" dir="ltr" />
        </div>
        <div>
          <label className="label">العنوان</label>
          <input value={form.address} onChange={e => set('address', e.target.value)} className="input" placeholder="الرياض، المملكة العربية السعودية" />
        </div>
        <div>
          <label className="label">الموقع الإلكتروني</label>
          <input value={form.website} onChange={e => set('website', e.target.value)} className="input" placeholder="https://example.com" dir="ltr" />
        </div>
        <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-60">
          {saveMut.isPending ? 'جاري الحفظ...' : 'حفظ البيانات'}
        </button>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('email');
  const user = useAuthStore(s => s.user);

  if (!['super_admin', 'admin'].includes(user?.role ?? '')) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center text-gray-400">
          <ExclamationCircleIcon className="w-12 h-12 mx-auto mb-3" />
          <p>هذه الصفحة للمدير فقط</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6" dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">إعدادات النظام</h1>
        <p className="text-gray-500 text-sm mt-1">تخصيص النظام وإعداد الخدمات</p>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit mb-6">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'email'   && <EmailSettings />}
      {activeTab === 'company' && <CompanySettings />}
    </div>
  );
}