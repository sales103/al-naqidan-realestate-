import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { BuildingOfficeIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { api } from '../services/api.ts';
import { useAuthStore } from '../store/auth.store.ts';

type Step = 'email' | 'otp' | 'profile';

const emailSchema = z.object({ email: z.string().email('بريد إلكتروني غير صحيح') });
const profileSchema = z.object({
  full_name: z.string().min(2, 'الاسم مطلوب'),
  password: z.string().min(8, 'كلمة المرور 8 أحرف على الأقل')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'يجب أن تحتوي حروف كبيرة وصغيرة وأرقام'),
  confirm: z.string(),
}).refine(d => d.password === d.confirm, { message: 'كلمتا المرور غير متطابقتين', path: ['confirm'] });

type EmailForm = z.infer<typeof emailSchema>;
type ProfileForm = z.infer<typeof profileSchema>;

export default function RegisterPage() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [verifiedToken, setVerifiedToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const navigate = useNavigate();
  const setAuth = useAuthStore(s => s.setAuth);

  const emailForm = useForm<EmailForm>({ resolver: zodResolver(emailSchema) });
  const profileForm = useForm<ProfileForm>({ resolver: zodResolver(profileSchema) });

  // ── Step 1: Send OTP ──────────────────────────────────────────────────────
  const onSendOtp = async (data: EmailForm) => {
    setLoading(true);
    try {
      await api.post('/auth/send-otp', { email: data.email, purpose: 'register' });
      setEmail(data.email);
      setStep('otp');
      startCountdown();
      toast.success('تم إرسال رمز التحقق');
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'حدث خطأ');
    } finally { setLoading(false); }
  };

  const startCountdown = () => {
    setCountdown(60);
    const interval = setInterval(() => {
      setCountdown(c => { if (c <= 1) { clearInterval(interval); return 0; } return c - 1; });
    }, 1000);
  };

  const resendOtp = async () => {
    if (countdown > 0) return;
    setLoading(true);
    try {
      await api.post('/auth/send-otp', { email, purpose: 'register' });
      startCountdown();
      toast.success('تم إعادة إرسال الرمز');
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'حدث خطأ');
    } finally { setLoading(false); }
  };

  // ── OTP input handling ────────────────────────────────────────────────────
  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...otp];
    next[index] = value.slice(-1);
    setOtp(next);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text.length === 6) {
      setOtp(text.split(''));
      otpRefs.current[5]?.focus();
    }
    e.preventDefault();
  };

  // ── Step 2: Verify OTP ───────────────────────────────────────────────────
  const onVerifyOtp = async () => {
    const code = otp.join('');
    if (code.length < 6) { toast.error('أدخل الرمز كاملاً'); return; }
    setLoading(true);
    try {
      const res = await api.post('/auth/verify-otp', { email, otp: code, purpose: 'register' });
      setVerifiedToken(res.data.verified_token);
      setStep('profile');
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'رمز غير صحيح');
    } finally { setLoading(false); }
  };

  // ── Step 3: Register ──────────────────────────────────────────────────────
  const onRegister = async (data: ProfileForm) => {
    setLoading(true);
    try {
      const res = await api.post('/auth/register', {
        verified_token: verifiedToken,
        full_name: data.full_name,
        full_name_ar: data.full_name,
        password: data.password,
      });
      const { token, user } = res.data.data;
      setAuth(token, user);
      toast.success(`مرحباً ${user.full_name_ar ?? user.full_name}!`);
      navigate('/dashboard');
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'حدث خطأ في التسجيل');
    } finally { setLoading(false); }
  };

  const stepLabels = ['البريد الإلكتروني', 'رمز التحقق', 'معلوماتك'];
  const stepIndex = step === 'email' ? 0 : step === 'otp' ? 1 : 2;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '40px 40px' }} />
      </div>

      <div className="relative w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-2xl p-8">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
              <BuildingOfficeIcon className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">إنشاء حساب جديد</h1>
          </div>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-0 mb-8">
            {stepLabels.map((label, i) => (
              <div key={i} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors ${
                    i < stepIndex ? 'bg-blue-600 border-blue-600 text-white'
                    : i === stepIndex ? 'bg-white border-blue-600 text-blue-600'
                    : 'bg-white border-gray-200 text-gray-400'
                  }`}>
                    {i < stepIndex ? '✓' : i + 1}
                  </div>
                  <span className={`text-[10px] mt-1 whitespace-nowrap ${i === stepIndex ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
                    {label}
                  </span>
                </div>
                {i < 2 && <div className={`w-12 h-0.5 mx-1 mb-4 ${i < stepIndex ? 'bg-blue-600' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>

          {/* ── Step 1: Email ─────────────────────────────────────────────── */}
          {step === 'email' && (
            <form onSubmit={emailForm.handleSubmit(onSendOtp)} className="space-y-5">
              <div>
                <label className="label">بريدك الإلكتروني</label>
                <input
                  {...emailForm.register('email')}
                  type="email"
                  placeholder="you@example.com"
                  className="input"
                  dir="ltr"
                  autoFocus
                />
                {emailForm.formState.errors.email && (
                  <p className="text-red-500 text-xs mt-1">{emailForm.formState.errors.email.message}</p>
                )}
                <p className="text-gray-400 text-xs mt-1">سنرسل رمز تحقق لهذا البريد</p>
              </div>

              <button type="submit" disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {loading ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>جاري الإرسال...</> : 'إرسال رمز التحقق'}
              </button>

              <div className="text-center text-sm text-gray-500">
                لديك حساب؟ <Link to="/login" className="text-blue-600 hover:text-blue-700 font-medium">تسجيل الدخول</Link>
              </div>
            </form>
          )}

          {/* ── Step 2: OTP ───────────────────────────────────────────────── */}
          {step === 'otp' && (
            <div className="space-y-6">
              <div className="text-center">
                <p className="text-gray-600 text-sm">أرسلنا رمز تحقق إلى</p>
                <p className="font-semibold text-gray-900 mt-0.5" dir="ltr">{email}</p>
              </div>

              <div className="flex justify-center gap-2" onPaste={handleOtpPaste}>
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={el => { otpRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleOtpChange(i, e.target.value)}
                    onKeyDown={e => handleOtpKeyDown(i, e)}
                    className="w-12 h-14 text-center text-2xl font-bold border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                    dir="ltr"
                  />
                ))}
              </div>

              <button onClick={onVerifyOtp} disabled={loading || otp.join('').length < 6}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {loading ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>جاري التحقق...</> : 'تحقق'}
              </button>

              <div className="text-center">
                {countdown > 0 ? (
                  <p className="text-gray-400 text-sm">إعادة الإرسال بعد {countdown}ث</p>
                ) : (
                  <button onClick={resendOtp} className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                    إعادة إرسال الرمز
                  </button>
                )}
              </div>

              <div className="text-center">
                <button onClick={() => setStep('email')} className="text-gray-400 hover:text-gray-600 text-sm">
                  تغيير البريد الإلكتروني
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Profile ───────────────────────────────────────────── */}
          {step === 'profile' && (
            <form onSubmit={profileForm.handleSubmit(onRegister)} className="space-y-4">
              <div>
                <label className="label">الاسم الكامل</label>
                <input {...profileForm.register('full_name')} type="text" placeholder="محمد العمري" className="input" autoFocus />
                {profileForm.formState.errors.full_name && (
                  <p className="text-red-500 text-xs mt-1">{profileForm.formState.errors.full_name.message}</p>
                )}
              </div>

              <div>
                <label className="label">كلمة المرور</label>
                <div className="relative">
                  <input {...profileForm.register('password')} type={showPass ? 'text' : 'password'}
                    placeholder="••••••••" className="input pl-10" dir="ltr" />
                  <button type="button" onClick={() => setShowPass(!showPass)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPass ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                  </button>
                </div>
                {profileForm.formState.errors.password && (
                  <p className="text-red-500 text-xs mt-1">{profileForm.formState.errors.password.message}</p>
                )}
              </div>

              <div>
                <label className="label">تأكيد كلمة المرور</label>
                <div className="relative">
                  <input {...profileForm.register('confirm')} type={showConfirm ? 'text' : 'password'}
                    placeholder="••••••••" className="input pl-10" dir="ltr" />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showConfirm ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                  </button>
                </div>
                {profileForm.formState.errors.confirm && (
                  <p className="text-red-500 text-xs mt-1">{profileForm.formState.errors.confirm.message}</p>
                )}
              </div>

              <div className="bg-blue-50 rounded-lg p-2.5 text-xs text-blue-700">
                كلمة المرور: 8 أحرف على الأقل، تحتوي حروف كبيرة وصغيرة وأرقام
              </div>

              <button type="submit" disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {loading ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>جاري التسجيل...</> : 'إنشاء الحساب'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-blue-200 text-xs mt-6">
          © {new Date().getFullYear()} شركة عبدالحكيم النقيدان للاستثمارات العقارية
        </p>
      </div>
    </div>
  );
}