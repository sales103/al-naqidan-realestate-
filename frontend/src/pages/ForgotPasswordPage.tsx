import { useState } from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { BuildingOfficeIcon, EnvelopeIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import { api } from '../services/api.ts';

const schema = z.object({ email: z.string().email('بريد إلكتروني غير صحيح') });
type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: data.email });
      setSent(true);
    } catch (error: any) {
      toast.error(error.response?.data?.error ?? 'حدث خطأ، حاول مجدداً');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '40px 40px' }} />
      </div>

      <div className="relative w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-2xl p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <BuildingOfficeIcon className="w-9 h-9 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">نسيت كلمة المرور</h1>
            <p className="text-gray-500 text-sm mt-1">سنرسل لك رابط إعادة التعيين على بريدك</p>
          </div>

          {sent ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <EnvelopeIcon className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">تحقق من بريدك الإلكتروني</h2>
              <p className="text-gray-500 text-sm mb-6">
                إذا كان البريد مسجلاً في النظام، ستصلك رسالة خلال دقائق تحتوي على رابط إعادة التعيين.
              </p>
              <Link to="/login" className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center justify-center gap-1">
                <ArrowRightIcon className="w-4 h-4" />
                العودة لتسجيل الدخول
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div>
                <label className="label">البريد الإلكتروني</label>
                <input
                  {...register('email')}
                  type="email"
                  placeholder="your@email.com"
                  className="input"
                  dir="ltr"
                  autoFocus
                />
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors duration-200 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    جاري الإرسال...
                  </>
                ) : 'إرسال رابط إعادة التعيين'}
              </button>

              <div className="text-center">
                <Link to="/login" className="text-blue-600 hover:text-blue-700 text-sm flex items-center justify-center gap-1">
                  <ArrowRightIcon className="w-4 h-4" />
                  العودة لتسجيل الدخول
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
