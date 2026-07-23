import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { BuildingOfficeIcon, EyeIcon, EyeSlashIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { authApi } from '../services/api.ts';

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;

export default function SetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();

  const [status, setStatus] = useState<'loading' | 'valid' | 'invalid' | 'success'>('loading');
  const [inviteData, setInviteData] = useState<{ email: string; full_name: string } | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) { setStatus('invalid'); return; }
    authApi.verifyInvite(token)
      .then((res: any) => {
        if (res.data?.valid) {
          setInviteData({ email: res.data.email, full_name: res.data.full_name });
          setStatus('valid');
        } else {
          setStatus('invalid');
        }
      })
      .catch(() => setStatus('invalid'));
  }, [token]);

  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasDigit = /\d/.test(password);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const isValid = hasMinLength && hasUppercase && hasLowercase && hasDigit && passwordsMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setSubmitting(true);
    try {
      await authApi.setPassword(token, password);
      setStatus('success');
      toast.success('تم تعيين كلمة المرور بنجاح');
      setTimeout(() => navigate('/login'), 2000);
    } catch (error: any) {
      toast.error(error.response?.data?.error ?? 'حدث خطأ');
    } finally {
      setSubmitting(false);
    }
  };

  const Requirement = ({ met, label }: { met: boolean; label: string }) => (
    <div className="flex items-center gap-2 text-xs" style={{ color: met ? '#059669' : '#94A3B8' }}>
      <div className="w-4 h-4 rounded-full flex items-center justify-center"
        style={{ background: met ? 'rgba(5,150,105,0.1)' : 'rgba(148,163,184,0.1)' }}>
        {met ? <CheckCircleIcon className="w-3 h-3" /> : <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#CBD5E1' }} />}
      </div>
      {label}
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-4 overflow-hidden relative" dir="rtl" style={{
      background: 'linear-gradient(135deg, #060C18 0%, #0B1525 40%, #0D1E3A 70%, #060C18 100%)',
    }}>
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.04,
        backgroundImage: 'radial-gradient(circle at 1px 1px, #C8A84B 1px, transparent 0)',
        backgroundSize: '48px 48px',
      }} />
      <div style={{
        position: 'absolute', top: '-80px', right: '30%',
        width: '500px', height: '500px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(200,168,75,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '-100px', left: '20%',
        width: '600px', height: '600px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(59,91,219,0.1) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div className="relative w-full max-w-md">
        <div className="rounded-3xl p-8" style={{
          background: 'rgba(255,255,255,0.97)',
          boxShadow: '0 24px 80px rgba(6,12,24,0.5), 0 4px 16px rgba(6,12,24,0.3), inset 0 1px 0 rgba(255,255,255,0.9)',
          border: '1px solid rgba(200,168,75,0.12)',
        }}>
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{
              background: 'linear-gradient(135deg, #A8892E 0%, #C8A84B 50%, #E2C670 100%)',
              boxShadow: '0 4px 20px rgba(200,168,75,0.45), inset 0 1px 0 rgba(255,255,255,0.25)',
            }}>
              <BuildingOfficeIcon className="w-9 h-9" style={{ color: '#1a0f00' }} />
            </div>
            <h1 className="text-2xl font-bold" style={{ color: '#0F1C35', letterSpacing: '-0.02em' }}>
              تعيين كلمة المرور
            </h1>
          </div>

          {/* Loading */}
          {status === 'loading' && (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm" style={{ color: '#7A8FAA' }}>جاري التحقق من الرابط...</p>
            </div>
          )}

          {/* Invalid Token */}
          {status === 'invalid' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(239,68,68,0.08)' }}>
                <ExclamationTriangleIcon className="w-8 h-8" style={{ color: '#DC2626' }} />
              </div>
              <p className="font-bold text-lg mb-2" style={{ color: '#0F1C35' }}>الرابط منتهي أو غير صالح</p>
              <p className="text-sm mb-6" style={{ color: '#7A8FAA' }}>تواصل مع المدير لإعادة إرسال رابط الدعوة</p>
              <Link to="/login" className="text-sm font-bold transition-colors" style={{ color: '#3B5BDB' }}>
                العودة لتسجيل الدخول
              </Link>
            </div>
          )}

          {/* Success */}
          {status === 'success' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(5,150,105,0.08)' }}>
                <CheckCircleIcon className="w-8 h-8" style={{ color: '#059669' }} />
              </div>
              <p className="font-bold text-lg mb-2" style={{ color: '#0F1C35' }}>تم تعيين كلمة المرور بنجاح</p>
              <p className="text-sm mb-4" style={{ color: '#7A8FAA' }}>جاري تحويلك لتسجيل الدخول...</p>
              <Link to="/login" className="text-sm font-bold transition-colors" style={{ color: '#3B5BDB' }}>
                تسجيل الدخول الآن
              </Link>
            </div>
          )}

          {/* Form */}
          {status === 'valid' && inviteData && (
            <>
              <div className="p-4 rounded-xl mb-6" style={{ background: 'rgba(59,91,219,0.05)', border: '1px solid rgba(59,91,219,0.1)' }}>
                <p className="text-sm font-bold" style={{ color: '#0F1C35' }}>{inviteData.full_name}</p>
                <p className="text-xs mt-0.5" style={{ color: '#7A8FAA' }}>{inviteData.email}</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="label">كلمة المرور</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••" className="input w-full pl-10" dir="ltr" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 transition-colors"
                      style={{ color: '#94A3B8' }}>
                      {showPassword ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="label">تأكيد كلمة المرور</label>
                  <div className="relative">
                    <input type={showConfirm ? 'text' : 'password'} value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="••••••••" className="input w-full pl-10" dir="ltr" />
                    <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 transition-colors"
                      style={{ color: '#94A3B8' }}>
                      {showConfirm ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Password requirements */}
                <div className="p-3 rounded-xl space-y-2" style={{ background: 'rgba(242,246,255,0.6)', border: '1px solid rgba(59,91,219,0.08)' }}>
                  <p className="text-xs font-bold mb-2" style={{ color: '#5A6882' }}>متطلبات كلمة المرور:</p>
                  <Requirement met={hasMinLength} label="8 أحرف على الأقل" />
                  <Requirement met={hasUppercase} label="حرف كبير (A-Z)" />
                  <Requirement met={hasLowercase} label="حرف صغير (a-z)" />
                  <Requirement met={hasDigit} label="رقم (0-9)" />
                  <Requirement met={passwordsMatch} label="كلمتا المرور متطابقتان" />
                </div>

                <button type="submit" disabled={!isValid || submitting}
                  className="w-full font-bold py-3 rounded-xl transition-all duration-200 disabled:opacity-60 flex items-center justify-center gap-2 text-sm"
                  style={{
                    background: submitting ? 'rgba(59,91,219,0.6)' : 'linear-gradient(135deg, #3B5BDB 0%, #5273F5 100%)',
                    color: '#fff',
                    boxShadow: '0 3px 12px rgba(59,91,219,0.4)',
                  }}>
                  {submitting ? (
                    <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>جاري الحفظ...</>
                  ) : 'تعيين كلمة المرور'}
                </button>
              </form>
            </>
          )}

          <div className="mt-6 pt-5" style={{ borderTop: '1px solid rgba(59,91,219,0.08)' }}>
            <div className="flex items-center justify-center gap-4 text-xs" style={{ color: '#C4CEDE' }}>
              <span>مؤمَّن بالكامل</span>
              <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: '#C8A84B', display: 'inline-block' }} />
              <span>مشفّر بـ 256-bit</span>
            </div>
          </div>
        </div>

        <p className="text-center text-xs mt-5" style={{ color: 'rgba(200,168,75,0.4)' }}>
          &copy; {new Date().getFullYear()} مكتب عبدالحكيم النقيدان للاستثمارات العقارية
        </p>
      </div>
    </div>
  );
}
