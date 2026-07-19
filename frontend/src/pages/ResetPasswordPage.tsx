import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { BuildingOfficeIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { api } from '../services/api.ts';

const schema = z.object({
  password: z.string()
    .min(8, 'كلمة المرور 8 أحرف على الأقل')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'يجب أن تحتوي حروف كبيرة وصغيرة وأرقام'),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, {
  message: 'كلمتا المرور غير متطابقتين',
  path: ['confirm'],
});

type FormData = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';

  useEffect(() => {
    if (!token) {
      toast.error('رابط غير صالح');
      navigate('/login');
    }
  }, [token, navigate]);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password: data.password });
      toast.success('تم تغيير كلمة المرور بنجاح');
      navigate('/login');
    } catch (error: any) {
      toast.error(error.response?.data?.error ?? 'الرابط غير صالح أو منتهي الصلاحية');
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
            <h1 className="text-xl font-bold text-gray-900">تعيين كلمة مرور جديدة</h1>
            <p className="text-gray-500 text-sm mt-1">أدخل كلمة المرور الجديدة</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="label">كلمة المرور الجديدة</label>
              <div className="relative">
                <input
                  {...register('password')}
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="input pl-10"
                  dir="ltr"
                  autoFocus
                />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPass ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
            </div>

            <div>
              <label className="label">تأكيد كلمة المرور</label>
              <div className="relative">
                <input
                  {...register('confirm')}
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="input pl-10"
                  dir="ltr"
                />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showConfirm ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                </button>
              </div>
              {errors.confirm && <p className="text-red-500 text-xs mt-1">{errors.confirm.message}</p>}
            </div>

            <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
              <p className="font-medium mb-1">متطلبات كلمة المرور:</p>
              <ul className="space-y-0.5 list-disc list-inside">
                <li>8 أحرف على الأقل</li>
                <li>حرف كبير وحرف صغير (A-Z, a-z)</li>
                <li>رقم واحد على الأقل (0-9)</li>
              </ul>
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
                  جاري الحفظ...
                </>
              ) : 'حفظ كلمة المرور الجديدة'}
            </button>

            <div className="text-center">
              <Link to="/login" className="text-blue-600 hover:text-blue-700 text-sm">
                العودة لتسجيل الدخول
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
