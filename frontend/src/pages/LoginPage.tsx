import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { BuildingOfficeIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { authApi } from '../services/api.ts';
import { useAuthStore } from '../store/auth.store.ts';
import TurnstileWidget from '../components/TurnstileWidget.tsx';

const schema = z.object({
  email: z.string().email('بريد إلكتروني غير صحيح'),
  password: z.string().min(6, 'كلمة المرور قصيرة جداً'),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tsToken, setTsToken] = useState('');
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const response = await authApi.login(data.email, data.password, tsToken);
      const { token, user } = response.data.data;
      setAuth(token, user);
      toast.success(`مرحباً ${user.full_name_ar ?? user.full_name}!`);
      navigate('/dashboard');
    } catch (error: any) {
      toast.error(error.response?.data?.error ?? 'خطأ في تسجيل الدخول');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" dir="rtl" style={{
      background: 'linear-gradient(135deg, #060C18 0%, #0B1525 40%, #0D1E3A 70%, #060C18 100%)',
    }}>
      {/* Background grid */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.04,
        backgroundImage: 'radial-gradient(circle at 1px 1px, #C8A84B 1px, transparent 0)',
        backgroundSize: '48px 48px',
      }} />

      {/* Gold glow top-left */}
      <div style={{
        position: 'absolute', top: '-80px', right: '30%',
        width: '500px', height: '500px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(200,168,75,0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      {/* Blue glow bottom-right */}
      <div style={{
        position: 'absolute', bottom: '-100px', left: '20%',
        width: '600px', height: '600px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(59,91,219,0.1) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div className="relative w-full max-w-md">
        {/* Card */}
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
              مكتب النقيدان العقاري
            </h1>
            <p className="text-sm mt-1" style={{ color: '#7A8FAA' }}>للاستثمارات العقارية — بريدة</p>
            <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={{
              background: 'rgba(5,150,105,0.08)',
              color: '#059669',
              border: '1px solid rgba(5,150,105,0.15)',
            }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#22C55E', boxShadow: '0 0 6px rgba(34,197,94,0.5)' }} />
              نظام الإدارة الذكي
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="label">البريد الإلكتروني</label>
              <input {...register('email')} type="email" placeholder="you@example.com" className="input" dir="ltr" />
              {errors.email && <p className="text-xs mt-1" style={{ color: '#DC2626' }}>{errors.email.message}</p>}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="label mb-0">كلمة المرور</span>
                <Link to="/forgot-password" className="text-xs font-semibold transition-colors" style={{ color: '#3B5BDB' }}>
                  نسيت كلمة المرور؟
                </Link>
              </div>
              <div className="relative">
                <input {...register('password')} type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••" className="input pl-10" dir="ltr" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: '#94A3B8' }}>
                  {showPassword ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs mt-1" style={{ color: '#DC2626' }}>{errors.password.message}</p>}
            </div>

            <TurnstileWidget onToken={setTsToken} onExpire={() => setTsToken('')} />

            <button type="submit" disabled={loading}
              className="w-full font-bold py-3 rounded-xl transition-all duration-200 disabled:opacity-60 flex items-center justify-center gap-2 text-sm"
              style={{
                background: loading ? 'rgba(59,91,219,0.6)' : 'linear-gradient(135deg, #3B5BDB 0%, #5273F5 100%)',
                color: '#fff',
                boxShadow: '0 3px 12px rgba(59,91,219,0.4)',
              }}
              onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 20px rgba(59,91,219,0.5)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 3px 12px rgba(59,91,219,0.4)'; }}>
              {loading ? (
                <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>جاري الدخول...</>
              ) : 'تسجيل الدخول'}
            </button>

            <div className="text-center pt-1">
              <span className="text-sm" style={{ color: '#7A8FAA' }}>موظف جديد؟ </span>
              <Link to="/register" className="text-sm font-bold transition-colors" style={{ color: '#3B5BDB' }}>
                إنشاء حساب
              </Link>
            </div>
          </form>

          {/* Divider */}
          <div className="mt-6 pt-5" style={{ borderTop: '1px solid rgba(59,91,219,0.08)' }}>
            <div className="flex items-center justify-center gap-4 text-xs" style={{ color: '#C4CEDE' }}>
              <span>مؤمَّن بالكامل</span>
              <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: '#C8A84B', display: 'inline-block' }} />
              <span>مشفّر بـ 256-bit</span>
              <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: '#C8A84B', display: 'inline-block' }} />
              <span>خصوصية تامة</span>
            </div>
          </div>
        </div>

        <p className="text-center text-xs mt-5" style={{ color: 'rgba(200,168,75,0.4)' }}>
          © {new Date().getFullYear()} مكتب عبدالحكيم النقيدان للاستثمارات العقارية
        </p>
      </div>
    </div>
  );
}
