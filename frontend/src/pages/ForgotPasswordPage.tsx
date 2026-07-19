import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { BuildingOfficeIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { api } from '../services/api.ts';

type Step = 'email' | 'otp' | 'password' | 'done';

const emailSchema = z.object({ email: z.string().email('بريد إلكتروني غير صحيح') });
const passwordSchema = z.object({
  password: z.string().min(8, '8 أحرف على الأقل')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'يجب أن تحتوي حروف كبيرة وصغيرة وأرقام'),
  confirm: z.string(),
}).refine(d => d.password === d.confirm, { message: 'كلمتا المرور غير متطابقتين', path: ['confirm'] });

type EmailForm = z.infer<typeof emailSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;

export default function ForgotPasswordPage() {
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

  const emailForm = useForm<EmailForm>({ resolver: zodResolver(emailSchema) });
  const passwordForm = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) });

  const startCountdown = () => {
    setCountdown(60);
    const interval = setInterval(() => {
      setCountdown(c => { if (c <= 1) { clearInterval(interval); return 0; } return c - 1; });
    }, 1000);
  };

  // Step 1
  const onSendOtp = async (data: EmailForm) => {
    setLoading(true);
    try {
      await api.post('/auth/send-otp', { email: data.email, purpose: 'reset' });
      setEmail(data.email);
      setStep('otp');
      startCountdown();
      toast.success('تم إرسال رمز التحقق');
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'حدث خطأ');
    } finally { setLoading(false); }
  };

  const resendOtp = async () => {
    if (countdown > 0) return;
    setLoading(true);
    try {
      await api.post('/auth/send-otp', { email, purpose: 'reset' });
      startCountdown();
      toast.success('تم إعادة إرسال الرمز');
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'حدث خطأ');
    } finally { setLoading(false); }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...otp];
    next[index] = value.slice(-1);
    setOtp(next);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) otpRefs.current[index - 1]?.focus();
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text.length === 6) { setOtp(text.split('')); otpRefs.current[5]?.focus(); }
    e.preventDefault();
  };

  // Step 2
  const onVerifyOtp = async () => {
    const code = otp.join('');
    if (code.length < 6) { toast.error('أدخل الرمز كاملاً'); return; }
    setLoading(true);
    try {
      const res = await api.post('/auth/verify-otp', { email, otp: code, purpose: 'reset' });
      setVerifiedToken(res.data.verified_token);
      setStep('password');
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'رمز غير صحيح');
    } finally { setLoading(false); }
  };

  // Step 3
  const onReset = async (data: PasswordForm) => {
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { verified_token: verifiedToken, password: data.password });
      setStep('done');
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'حدث خطأ');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '40px 40px' }} />
      </div>

      <div className="relative w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-2xl p-8">
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
              <BuildingOfficeIcon className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">نسيت كلمة المرور</h1>
          </div>

          {/* Step 1: Email */}
          {step === 'email' && (
            <form onSubmit={emailForm.handleSubmit(onSendOtp)} className="space-y-5">
              <div>
                <label className="label">بريدك الإلكتروني المسجل</label>
                <input {...emailForm.register('email')} type="email" placeholder="you@example.com"
                  className="input" dir="ltr" autoFocus />
                {emailForm.formState.errors.email && (
                  <p className="text-red-500 text-xs mt-1">{emailForm.formState.errors.email.message}</p>
                )}
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {loading ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>جاري الإرسال...</> : 'إرسال رمز التحقق'}
              </button>
              <div className="text-center">
                <Link to="/login" className="text-blue-600 hover:text-blue-700 text-sm">العودة لتسجيل الدخول</Link>
              </div>
            </form>
          )}

          {/* Step 2: OTP */}
          {step === 'otp' && (
            <div className="space-y-6">
              <div className="text-center">
                <p className="text-gray-600 text-sm">أرسلنا رمز تحقق إلى</p>
                <p className="font-semibold text-gray-900 mt-0.5" dir="ltr">{email}</p>
              </div>
              <div className="flex justify-center gap-2" onPaste={handleOtpPaste}>
                {otp.map((digit, i) => (
                  <input key={i} ref={el => { otpRefs.current[i] = el; }} type="text" inputMode="numeric"
                    maxLength={1} value={digit}
                    onChange={e => handleOtpChange(i, e.target.value)}
                    onKeyDown={e => handleOtpKeyDown(i, e)}
                    className="w-12 h-14 text-center text-2xl font-bold border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:outline-none transition-colors"
                    dir="ltr" />
                ))}
              </div>
              <button onClick={onVerifyOtp} disabled={loading || otp.join('').length < 6}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {loading ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>جاري التحقق...</> : 'تحقق من الرمز'}
              </button>
              <div className="text-center">
                {countdown > 0
                  ? <p className="text-gray-400 text-sm">إعادة الإرسال بعد {countdown}ث</p>
                  : <button onClick={resendOtp} className="text-blue-600 hover:text-blue-700 text-sm font-medium">إعادة إرسال الرمز</button>
                }
              </div>
            </div>
          )}

          {/* Step 3: New Password */}
          {step === 'password' && (
            <form onSubmit={passwordForm.handleSubmit(onReset)} className="space-y-4">
              <div>
                <label className="label">كلمة المرور الجديدة</label>
                <div className="relative">
                  <input {...passwordForm.register('password')} type={showPass ? 'text' : 'password'}
                    placeholder="••••••••" className="input pl-10" dir="ltr" autoFocus />
                  <button type="button" onClick={() => setShowPass(!showPass)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPass ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                  </button>
                </div>
                {passwordForm.formState.errors.password && (
                  <p className="text-red-500 text-xs mt-1">{passwordForm.formState.errors.password.message}</p>
                )}
              </div>
              <div>
                <label className="label">تأكيد كلمة المرور</label>
                <div className="relative">
                  <input {...passwordForm.register('confirm')} type={showConfirm ? 'text' : 'password'}
                    placeholder="••••••••" className="input pl-10" dir="ltr" />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showConfirm ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                  </button>
                </div>
                {passwordForm.formState.errors.confirm && (
                  <p className="text-red-500 text-xs mt-1">{passwordForm.formState.errors.confirm.message}</p>
                )}
              </div>
              <button type="submit" disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {loading ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>جاري الحفظ...</> : 'حفظ كلمة المرور الجديدة'}
              </button>
            </form>
          )}

          {/* Done */}
          {step === 'done' && (
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">✓</span>
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">تم تغيير كلمة المرور!</h2>
              <p className="text-gray-500 text-sm mb-6">يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة</p>
              <button onClick={() => navigate('/login')}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors">
                تسجيل الدخول
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}