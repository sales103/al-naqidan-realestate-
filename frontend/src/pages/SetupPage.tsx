import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import {
  BuildingOfficeIcon, UserCircleIcon, EnvelopeIcon,
  CheckCircleIcon, EyeIcon, EyeSlashIcon, ChevronRightIcon, ChevronLeftIcon,
} from '@heroicons/react/24/outline';
import { api } from '../services/api.ts';

// ─── Schemas ─────────────────────────────────────────────────────────────────
const adminSchema = z.object({
  admin_name:     z.string().min(2, 'الاسم مطلوب'),
  admin_email:    z.string().email('بريد إلكتروني غير صحيح'),
  admin_password: z.string().min(8, '8 أحرف على الأقل')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'يجب حروف كبيرة وصغيرة وأرقام'),
  admin_confirm:  z.string(),
}).refine(d => d.admin_password === d.admin_confirm, {
  message: 'كلمتا المرور غير متطابقتين', path: ['admin_confirm'],
});

const companySchema = z.object({
  company_name_ar: z.string().min(2, 'اسم الشركة مطلوب'),
  company_name_en: z.string().optional(),
  company_phone:   z.string().optional(),
  company_address: z.string().optional(),
});

const smtpSchema = z.object({
  smtp_host:      z.string().min(1, 'مطلوب'),
  smtp_port:      z.string().min(1, 'مطلوب'),
  smtp_user:      z.string().email('بريد غير صحيح'),
  smtp_password:  z.string().min(1, 'مطلوب'),
  smtp_from:      z.string().optional(),
  smtp_from_name: z.string().optional(),
});

type AdminForm   = z.infer<typeof adminSchema>;
type CompanyForm = z.infer<typeof companySchema>;
type SmtpForm    = z.infer<typeof smtpSchema>;

// ─── Step config ─────────────────────────────────────────────────────────────
const STEPS = [
  { id: 0, label: 'مرحباً',      icon: BuildingOfficeIcon },
  { id: 1, label: 'حساب المدير', icon: UserCircleIcon },
  { id: 2, label: 'الشركة',      icon: BuildingOfficeIcon },
  { id: 3, label: 'البريد',      icon: EnvelopeIcon },
  { id: 4, label: 'جاهز!',       icon: CheckCircleIcon },
];

export default function SetupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSmtpPass, setShowSmtpPass] = useState(false);

  // Data collected across steps
  const [adminData, setAdminData]     = useState<AdminForm | null>(null);
  const [companyData, setCompanyData] = useState<CompanyForm | null>(null);

  const adminForm   = useForm<AdminForm>  ({ resolver: zodResolver(adminSchema) });
  const companyForm = useForm<CompanyForm>({ resolver: zodResolver(companySchema) });
  const smtpForm    = useForm<SmtpForm>  ({ resolver: zodResolver(smtpSchema), defaultValues: { smtp_host: 'smtp.gmail.com', smtp_port: '587' } });

  const smtpPresets = [
    { label: 'Gmail',   host: 'smtp.gmail.com',        port: '587' },
    { label: 'Outlook', host: 'smtp.office365.com',    port: '587' },
    { label: 'Yahoo',   host: 'smtp.mail.yahoo.com',   port: '465' },
  ];

  // ── Final submit ─────────────────────────────────────────────────────────
  const onFinish = async (smtpValues: SmtpForm) => {
    if (!adminData || !companyData) return;
    setLoading(true);
    try {
      await api.post('/setup/init', {
        ...adminData,
        ...companyData,
        smtp_host:      smtpValues.smtp_host,
        smtp_port:      Number(smtpValues.smtp_port),
        smtp_user:      smtpValues.smtp_user,
        smtp_password:  smtpValues.smtp_password,
        smtp_from:      smtpValues.smtp_from || smtpValues.smtp_user,
        smtp_from_name: smtpValues.smtp_from_name || companyData.company_name_ar,
      });
      setStep(4);
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'حدث خطأ');
    } finally { setLoading(false); }
  };

  const skipSmtp = async () => {
    if (!adminData || !companyData) return;
    setLoading(true);
    try {
      await api.post('/setup/init', { ...adminData, ...companyData });
      setStep(4);
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'حدث خطأ');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col items-center justify-center p-4" dir="rtl">
      {/* Background grid */}
      <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />

      <div className="relative w-full max-w-lg">

        {/* Progress bar */}
        {step > 0 && step < 4 && (
          <div className="mb-6">
            <div className="flex justify-between mb-2">
              {STEPS.slice(1, 4).map((s, i) => {
                const idx = i + 1;
                return (
                  <div key={s.id} className="flex flex-col items-center gap-1">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all ${
                      idx < step ? 'bg-blue-500 border-blue-500 text-white'
                      : idx === step ? 'bg-white border-blue-400 text-blue-700'
                      : 'bg-slate-800 border-slate-600 text-slate-500'
                    }`}>
                      {idx < step ? <CheckCircleIcon className="w-5 h-5" /> : <s.icon className="w-4 h-4" />}
                    </div>
                    <span className={`text-[10px] ${idx === step ? 'text-blue-300' : 'text-slate-500'}`}>{s.label}</span>
                  </div>
                );
              })}
            </div>
            <div className="h-1 bg-slate-700 rounded-full mt-1">
              <div className="h-1 bg-blue-500 rounded-full transition-all" style={{ width: `${((step - 1) / 3) * 100}%` }} />
            </div>
          </div>
        )}

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">

          {/* ── Step 0: Welcome ──────────────────────────────────────────── */}
          {step === 0 && (
            <div className="p-10 text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-blue-700 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-200">
                <BuildingOfficeIcon className="w-11 h-11 text-white" />
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">مرحباً بك في النظام</h1>
              <p className="text-gray-500 mb-2">نظام إدارة العقارات الذكي</p>
              <div className="w-12 h-1 bg-blue-600 rounded-full mx-auto mb-6" />
              <p className="text-gray-600 text-sm leading-relaxed mb-8">
                سنقوم الآن بإعداد النظام في دقيقتين فقط.<br />
                ستحتاج إلى: <strong>بيانات حسابك</strong> + <strong>اسم شركتك</strong> + <strong>بريد إلكتروني للإشعارات</strong>
              </p>
              <button onClick={() => setStep(1)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl transition-colors text-lg flex items-center justify-center gap-2">
                ابدأ الإعداد
                <ChevronLeftIcon className="w-5 h-5" />
              </button>
              <button type="button" onClick={() => navigate("/login")}
                className="mt-3 w-full text-sm text-slate-400 hover:text-slate-200 transition-colors py-2">
                ربما لاحقاً — تسجيل الدخول أولاً
              </button>
            </div>
          )}

          {/* ── Step 1: Admin Account ─────────────────────────────────── */}
          {step === 1 && (
            <form onSubmit={adminForm.handleSubmit(d => { setAdminData(d); setStep(2); })} className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <UserCircleIcon className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">حساب المدير</h2>
                  <p className="text-gray-400 text-xs">الحساب الرئيسي للنظام</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="label">الاسم الكامل</label>
                  <input {...adminForm.register('admin_name')} className="input" placeholder="محمد العمري" autoFocus />
                  {adminForm.formState.errors.admin_name && <p className="text-red-500 text-xs mt-1">{adminForm.formState.errors.admin_name.message}</p>}
                </div>
                <div>
                  <label className="label">البريد الإلكتروني</label>
                  <input {...adminForm.register('admin_email')} type="email" className="input" placeholder="admin@company.com" dir="ltr" />
                  {adminForm.formState.errors.admin_email && <p className="text-red-500 text-xs mt-1">{adminForm.formState.errors.admin_email.message}</p>}
                </div>
                <div>
                  <label className="label">كلمة المرور</label>
                  <div className="relative">
                    <input {...adminForm.register('admin_password')} type={showPass ? 'text' : 'password'} className="input pl-10" placeholder="••••••••" dir="ltr" />
                    <button type="button" onClick={() => setShowPass(!showPass)} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPass ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                    </button>
                  </div>
                  {adminForm.formState.errors.admin_password && <p className="text-red-500 text-xs mt-1">{adminForm.formState.errors.admin_password.message}</p>}
                </div>
                <div>
                  <label className="label">تأكيد كلمة المرور</label>
                  <div className="relative">
                    <input {...adminForm.register('admin_confirm')} type={showConfirm ? 'text' : 'password'} className="input pl-10" placeholder="••••••••" dir="ltr" />
                    <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showConfirm ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                    </button>
                  </div>
                  {adminForm.formState.errors.admin_confirm && <p className="text-red-500 text-xs mt-1">{adminForm.formState.errors.admin_confirm.message}</p>}
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button type="button" onClick={() => setStep(0)} className="px-4 py-3 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors flex items-center gap-1">
                  <ChevronRightIcon className="w-4 h-4" /> رجوع
                </button>
                <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                  التالي <ChevronLeftIcon className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}

          {/* ── Step 2: Company Info ──────────────────────────────────── */}
          {step === 2 && (
            <form onSubmit={companyForm.handleSubmit(d => { setCompanyData(d); setStep(3); })} className="p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <BuildingOfficeIcon className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">بيانات الشركة</h2>
                  <p className="text-gray-400 text-xs">ستظهر في النظام وفي الإيميلات</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="label">اسم الشركة (عربي) *</label>
                  <input {...companyForm.register('company_name_ar')} className="input" placeholder="شركة ... للاستثمارات العقارية" autoFocus />
                  {companyForm.formState.errors.company_name_ar && <p className="text-red-500 text-xs mt-1">{companyForm.formState.errors.company_name_ar.message}</p>}
                </div>
                <div>
                  <label className="label">Company Name (English)</label>
                  <input {...companyForm.register('company_name_en')} className="input" placeholder="... Real Estate" dir="ltr" />
                </div>
                <div>
                  <label className="label">رقم الهاتف</label>
                  <input {...companyForm.register('company_phone')} className="input" placeholder="+966 5X XXX XXXX" dir="ltr" />
                </div>
                <div>
                  <label className="label">العنوان</label>
                  <input {...companyForm.register('company_address')} className="input" placeholder="الرياض، المملكة العربية السعودية" />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button type="button" onClick={() => setStep(1)} className="px-4 py-3 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors flex items-center gap-1">
                  <ChevronRightIcon className="w-4 h-4" /> رجوع
                </button>
                <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                  التالي <ChevronLeftIcon className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}

          {/* ── Step 3: SMTP ──────────────────────────────────────────── */}
          {step === 3 && (
            <form onSubmit={smtpForm.handleSubmit(onFinish)} className="p-8">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                  <EnvelopeIcon className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">بريد الإشعارات</h2>
                  <p className="text-gray-400 text-xs">يُستخدم لإرسال رموز التحقق للموظفين</p>
                </div>
              </div>

              {/* Presets */}
              <div className="flex gap-2 mb-4">
                {smtpPresets.map(p => (
                  <button key={p.label} type="button"
                    onClick={() => { smtpForm.setValue('smtp_host', p.host); smtpForm.setValue('smtp_port', p.port); }}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${smtpForm.watch('smtp_host') === p.host ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'}`}>
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="label">SMTP Host</label>
                    <input {...smtpForm.register('smtp_host')} className="input text-sm" dir="ltr" />
                    {smtpForm.formState.errors.smtp_host && <p className="text-red-500 text-xs mt-0.5">{smtpForm.formState.errors.smtp_host.message}</p>}
                  </div>
                  <div>
                    <label className="label">Port</label>
                    <input {...smtpForm.register('smtp_port')} className="input text-sm" dir="ltr" />
                  </div>
                </div>
                <div>
                  <label className="label">البريد الإلكتروني</label>
                  <input {...smtpForm.register('smtp_user')} type="email" className="input" placeholder="info@company.com" dir="ltr" />
                  {smtpForm.formState.errors.smtp_user && <p className="text-red-500 text-xs mt-0.5">{smtpForm.formState.errors.smtp_user.message}</p>}
                </div>
                <div>
                  <label className="label">كلمة المرور / App Password</label>
                  <div className="relative">
                    <input {...smtpForm.register('smtp_password')} type={showSmtpPass ? 'text' : 'password'} className="input pl-10" placeholder="••••••••••••••••" dir="ltr" />
                    <button type="button" onClick={() => setShowSmtpPass(!showSmtpPass)} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showSmtpPass ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                    </button>
                  </div>
                  {smtpForm.formState.errors.smtp_password && <p className="text-red-500 text-xs mt-0.5">{smtpForm.formState.errors.smtp_password.message}</p>}
                </div>
                <div>
                  <label className="label">اسم المرسل (اختياري)</label>
                  <input {...smtpForm.register('smtp_from_name')} className="input" placeholder={companyData?.company_name_ar ?? 'اسم الشركة'} />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button type="button" onClick={() => setStep(2)} className="px-4 py-3 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors flex items-center gap-1">
                  <ChevronRightIcon className="w-4 h-4" /> رجوع
                </button>
                <button type="submit" disabled={loading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                  {loading ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>جاري الحفظ...</> : <><CheckCircleIcon className="w-5 h-5" /> إنهاء الإعداد</>}
                </button>
              </div>
              <div className="text-center mt-3">
                <button type="button" onClick={skipSmtp} disabled={loading} className="text-gray-400 hover:text-gray-500 text-xs underline">
                  تخطي — سأعدّ البريد لاحقاً
                </button>
              </div>
            </form>
          )}

          {/* ── Step 4: Done ──────────────────────────────────────────── */}
          {step === 4 && (
            <div className="p-10 text-center">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircleIcon className="w-12 h-12 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">تم إعداد النظام!</h2>
              <p className="text-gray-500 mb-2">{companyData?.company_name_ar}</p>
              <div className="w-12 h-1 bg-green-500 rounded-full mx-auto mb-6" />
              <div className="bg-gray-50 rounded-2xl p-4 text-right mb-8 space-y-2 text-sm">
                <p className="flex items-center gap-2 text-gray-700"><CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0" /> تم إنشاء حساب المدير</p>
                <p className="flex items-center gap-2 text-gray-700"><CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0" /> تم حفظ بيانات الشركة</p>
                <p className="flex items-center gap-2 text-gray-700"><CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0" /> يمكن إضافة الموظفين الآن</p>
              </div>
              <button onClick={() => navigate('/login')}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl transition-colors text-lg">
                الدخول للنظام
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          نظام إدارة العقارات الذكي — مدعوم بالذكاء الاصطناعي
        </p>
      </div>
    </div>
  );
}
