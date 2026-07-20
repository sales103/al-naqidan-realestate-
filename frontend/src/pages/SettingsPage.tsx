import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  EnvelopeIcon, CheckCircleIcon, ExclamationCircleIcon,
  EyeIcon, EyeSlashIcon, Cog6ToothIcon, CpuChipIcon,
  BuildingOfficeIcon, ClockIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { settingsApi, api } from '../services/api.ts';
import { useAuthStore } from '../store/auth.store.ts';

const TABS = [
  { id: 'ai',      label: 'الذكاء الاصطناعي', icon: CpuChipIcon },
  { id: 'email',   label: 'البريد الإلكتروني',  icon: EnvelopeIcon },
  { id: 'company', label: 'بيانات الشركة',       icon: BuildingOfficeIcon },
] as const;

type Tab = typeof TABS[number]['id'];

// ── AI Settings ──────────────────────────────────────────────────────────────
function AISettings() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    openai_key:        '',
    openai_model:      'gpt-4o-mini',
    base_url:          '',
    system_prompt:     '',
    work_start:        '08:00',
    work_end:          '22:00',
    auto_respond:      true,
    respect_hours:     true,
    max_tokens:        '500',
    temperature:       '0.7',
  });
  const [showKey, setShowKey] = useState(false);
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'ai'],
    queryFn: () => settingsApi.get('ai'),
  });

  const keyIsSaved = Boolean((data as any)?.data?.data?.openai_key_set);

  useEffect(() => {
    const v = (data as any)?.data?.data;
    if (v) setForm({
      openai_key:    '',
      openai_model:  v.model        ?? 'gpt-4o-mini',
      base_url:      v.base_url     ?? '',
      system_prompt: v.system_prompt ?? '',
      work_start:    v.work_start   ?? '08:00',
      work_end:      v.work_end     ?? '22:00',
      auto_respond:  v.auto_respond ?? true,
      respect_hours: v.respect_hours ?? true,
      max_tokens:    String(v.max_tokens ?? 500),
      temperature:   String(v.temperature ?? 0.7),
    });
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () => settingsApi.save('ai', {
      model:         form.openai_model,
      base_url:      form.base_url || undefined,
      system_prompt: form.system_prompt || undefined,
      work_start:    form.work_start,
      work_end:      form.work_end,
      auto_respond:  form.auto_respond,
      respect_hours: form.respect_hours,
      max_tokens:    parseInt(form.max_tokens) || 500,
      temperature:   parseFloat(form.temperature) || 0.7,
      ...(form.openai_key ? { openai_key: form.openai_key } : {}),
    }),
    onSuccess: () => { toast.success('تم حفظ إعدادات الذكاء الاصطناعي'); qc.invalidateQueries({ queryKey: ['settings'] }); },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'فشل الحفظ'),
  });

  if (isLoading) return <div className="py-12 text-center text-gray-400">جاري التحميل...</div>;

  const PROVIDERS = [
    { value: 'openai', label: 'OpenAI', url: 'https://api.openai.com/v1', models: [
      { value: 'gpt-4o',        label: 'GPT-4o — الأذكى والأقوى' },
      { value: 'gpt-4o-mini',   label: 'GPT-4o Mini — سريع وموفر (موصى به)' },
      { value: 'gpt-4-turbo',   label: 'GPT-4 Turbo' },
      { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo — الأسرع والأرخص' },
    ]},
    { value: 'groq', label: 'Groq (مجاني وسريع)', url: 'https://api.groq.com/openai/v1', models: [
      { value: 'llama-3.3-70b-versatile',      label: 'Llama 3.3 70B — موصى به' },
      { value: 'llama-3.1-8b-instant',         label: 'Llama 3.1 8B — الأسرع' },
      { value: 'mixtral-8x7b-32768',           label: 'Mixtral 8x7B' },
      { value: 'gemma2-9b-it',                 label: 'Gemma 2 9B' },
    ]},
  ];
  const isGroq = form.base_url?.includes('groq.com') || false;
  const currentProvider = isGroq ? PROVIDERS[1] : PROVIDERS[0];
  const models = currentProvider.models;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Status banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <CpuChipIcon className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p className="font-semibold mb-1">كيف يعمل الذكاء الاصطناعي؟</p>
          <p>النظام يستقبل رسائل واتساب تلقائياً، يحللها بـ AI، يبحث في قاعدة العقارات، ويرد بشكل احترافي. يمكن تعطيله لأي محادثة من صفحة المحادثات.</p>
        </div>
      </div>

      {/* API Key */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <h3 className="font-bold text-gray-900 flex items-center gap-2">
          <span className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center text-xs font-bold text-blue-700">1</span>
          مزود الذكاء الاصطناعي
        </h3>

        <div className="grid grid-cols-2 gap-3">
          {PROVIDERS.map(p => (
            <button key={p.value} type="button"
              onClick={() => { set('base_url', p.value === 'openai' ? '' : p.url); set('openai_model', p.models[0].value); }}
              className={`p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                (p.value === 'groq' ? isGroq : !isGroq)
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}>
              {p.label}
            </button>
          ))}
        </div>

        <div>
          <label className="label flex items-center gap-2">
            API Key
            {keyIsSaved && (
              <span className="text-xs font-normal text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                ✓ مفتاح محفوظ
              </span>
            )}
          </label>
          <div className="relative">
            <input
              value={form.openai_key}
              onChange={e => set('openai_key', e.target.value)}
              type={showKey ? 'text' : 'password'}
              className="input pl-10 font-mono text-sm"
              placeholder={keyIsSaved ? '•••••••••••••••• (اتركه فارغاً للإبقاء على المفتاح الحالي)' : 'sk-... الصق المفتاح هنا'}
              dir="ltr"
            />
            <button type="button" onClick={() => setShowKey(!showKey)}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showKey ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
            </button>
          </div>
          {keyIsSaved && (
            <p className="text-xs text-green-700 mt-1">
              المفتاح مُخزَّن. لا يُعرض هنا لحمايته — اتركه فارغاً ما لم ترد استبداله.
            </p>
          )}
          <p className="text-xs text-gray-400 mt-1">
            احصل على مفتاحك من <span className="font-mono bg-gray-100 px-1 rounded">{isGroq ? 'console.groq.com/keys' : 'platform.openai.com/api-keys'}</span>
          </p>
        </div>

        <div>
          <label className="label">النموذج (Model)</label>
          <select className="input" value={form.openai_model} onChange={e => set('openai_model', e.target.value)}>
            {models.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>

        <div>
          <label className="label">Base URL (اختياري — للأنظمة البديلة)</label>
          <input value={form.base_url} onChange={e => set('base_url', e.target.value)}
            className="input font-mono text-sm" placeholder="https://api.openai.com/v1" dir="ltr" />
          <p className="text-xs text-gray-400 mt-1">{isGroq ? 'يستخدم Groq API تلقائياً' : 'اتركه فارغاً لاستخدام OpenAI الأصلي'}</p>
        </div>
      </div>

      {/* Working Hours */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <h3 className="font-bold text-gray-900 flex items-center gap-2">
          <span className="w-6 h-6 bg-orange-100 rounded-lg flex items-center justify-center text-xs font-bold text-orange-700">2</span>
          ساعات العمل
        </h3>

        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
          <div>
            <p className="text-sm font-semibold text-gray-800">الرد التلقائي</p>
            <p className="text-xs text-gray-500">AI يرد على الرسائل تلقائياً</p>
          </div>
          <button onClick={() => set('auto_respond', !form.auto_respond)}
            className={`relative w-12 h-6 rounded-full transition-colors ${form.auto_respond ? 'bg-blue-600' : 'bg-gray-300'}`}>
            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${form.auto_respond ? 'right-1' : 'left-1'}`} />
          </button>
        </div>

        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
          <div>
            <p className="text-sm font-semibold text-gray-800">احترام ساعات العمل</p>
            <p className="text-xs text-gray-500">توقف AI خارج أوقات العمل</p>
          </div>
          <button onClick={() => set('respect_hours', !form.respect_hours)}
            className={`relative w-12 h-6 rounded-full transition-colors ${form.respect_hours ? 'bg-blue-600' : 'bg-gray-300'}`}>
            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${form.respect_hours ? 'right-1' : 'left-1'}`} />
          </button>
        </div>

        {form.respect_hours && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label flex items-center gap-1.5">
                <ClockIcon className="w-4 h-4 text-green-600" /> بداية العمل
              </label>
              <input type="time" className="input" value={form.work_start}
                onChange={e => set('work_start', e.target.value)} dir="ltr" />
            </div>
            <div>
              <label className="label flex items-center gap-1.5">
                <ClockIcon className="w-4 h-4 text-red-500" /> نهاية العمل
              </label>
              <input type="time" className="input" value={form.work_end}
                onChange={e => set('work_end', e.target.value)} dir="ltr" />
            </div>
          </div>
        )}
      </div>

      {/* AI Behavior */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <h3 className="font-bold text-gray-900 flex items-center gap-2">
          <span className="w-6 h-6 bg-purple-100 rounded-lg flex items-center justify-center text-xs font-bold text-purple-700">3</span>
          سلوك الذكاء الاصطناعي
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">الحد الأقصى للرد (كلمات)</label>
            <input type="number" min="100" max="2000" step="50"
              value={form.max_tokens} onChange={e => set('max_tokens', e.target.value)}
              className="input" dir="ltr" />
            <p className="text-xs text-gray-400 mt-1">500 مناسب لمعظم الردود</p>
          </div>
          <div>
            <label className="label">درجة الإبداعية (0 = حرفي، 1 = مبدع)</label>
            <input type="range" min="0" max="1" step="0.1"
              value={form.temperature} onChange={e => set('temperature', e.target.value)}
              className="w-full mt-2" />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>دقيق (0)</span>
              <span className="font-semibold text-blue-600">{form.temperature}</span>
              <span>مبدع (1)</span>
            </div>
          </div>
        </div>

        <div>
          <label className="label">البرومبت المخصص (System Prompt)</label>
          <textarea
            className="input w-full resize-none font-mono text-xs leading-relaxed"
            rows={8}
            value={form.system_prompt}
            onChange={e => set('system_prompt', e.target.value)}
            placeholder="اتركه فارغاً لاستخدام البرومبت الافتراضي المدمج في النظام.

مثال:
أنت مساعد عقاري ذكي لشركة النقيدان العقارية في الرياض.
تتحدث العربية الفصحى بأسلوب مهني ودود.
تساعد العملاء في البحث عن العقارات المناسبة..." />
          <p className="text-xs text-gray-400 mt-1">هذا النص يُضاف في بداية كل محادثة ليحدد شخصية وسلوك الذكاء الاصطناعي</p>
        </div>
      </div>

      <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
        className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-60">
        {saveMut.isPending ? 'جاري الحفظ...' : 'حفظ إعدادات الذكاء الاصطناعي'}
      </button>
    </div>
  );
}

// ── Email Settings ──────────────────────────────────────────────────────────
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
    if (v) setForm({
      host:      v.host      ?? 'smtp.gmail.com',
      port:      String(v.port ?? 587),
      user:      v.user      ?? '',
      password:  '',
      from:      v.from      ?? '',
      from_name: v.from_name ?? '',
    });
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () => settingsApi.save('smtp', {
      host: form.host, port: Number(form.port),
      user: form.user,
      ...(form.password ? { password: form.password } : {}),
      from: form.from || form.user,
      from_name: form.from_name || 'النظام',
    }),
    onSuccess: () => { toast.success('تم حفظ إعدادات البريد'); qc.invalidateQueries({ queryKey: ['settings'] }); },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'فشل الحفظ'),
  });

  const testEmail = async () => {
    if (!form.user) { toast.error('أدخل البريد الإلكتروني أولاً'); return; }
    setTesting(true); setTestResult(null);
    try {
      await api.post('/settings/test-email', { to: form.user });
      setTestResult({ ok: true, msg: 'تم إرسال بريد تجريبي — تحقق من صندوقك' });
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.response?.data?.error ?? 'فشل الإرسال' });
    } finally { setTesting(false); }
  };

  if (isLoading) return <div className="py-12 text-center text-gray-400">جاري التحميل...</div>;

  const presets = [
    { label: 'Gmail',   host: 'smtp.gmail.com',       port: '587' },
    { label: 'Outlook', host: 'smtp.office365.com',    port: '587' },
    { label: 'Yahoo',   host: 'smtp.mail.yahoo.com',   port: '465' },
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        <p className="font-semibold mb-1">كيف يعمل البريد؟</p>
        <p>يستخدم النظام هذا البريد لإرسال رموز التحقق عند تسجيل الموظفين وإعادة كلمة المرور.</p>
      </div>

      <div>
        <p className="text-sm text-gray-500 mb-2">اختر مزود البريد:</p>
        <div className="flex gap-2">
          {presets.map(p => (
            <button key={p.label} onClick={() => { set('host', p.host); set('port', p.port); }}
              className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${form.host === p.host ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:border-blue-400'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className="label">SMTP Host</label>
            <input value={form.host} onChange={e => set('host', e.target.value)} className="input" placeholder="smtp.gmail.com" dir="ltr" />
          </div>
          <div>
            <label className="label">Port</label>
            <input value={form.port} onChange={e => set('port', e.target.value)} className="input" type="number" dir="ltr" />
          </div>
        </div>
        <div>
          <label className="label">البريد الإلكتروني</label>
          <input value={form.user} onChange={e => set('user', e.target.value)} className="input" placeholder="info@company.com" dir="ltr" type="email" />
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
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">بريد الإرسال (From)</label>
            <input value={form.from} onChange={e => set('from', e.target.value)} className="input" dir="ltr" type="email" />
          </div>
          <div>
            <label className="label">اسم المرسل</label>
            <input value={form.from_name} onChange={e => set('from_name', e.target.value)} className="input" placeholder="شركة النقيدان" />
          </div>
        </div>
        {testResult && (
          <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${testResult.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {testResult.ok ? <CheckCircleIcon className="w-5 h-5" /> : <ExclamationCircleIcon className="w-5 h-5" />}
            {testResult.msg}
          </div>
        )}
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

      {form.host === 'smtp.gmail.com' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 space-y-2">
          <p className="font-semibold">خطوات Gmail App Password:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>اذهب إلى <span className="font-mono bg-amber-100 px-1 rounded">myaccount.google.com</span></li>
            <li>الأمان ← التحقق بخطوتين ← فعّله</li>
            <li>ابحث عن "App passwords"</li>
            <li>اختر Other واكتب "نظام العقارات"</li>
            <li>انسخ الـ 16 حرف والصقها في حقل كلمة المرور</li>
          </ol>
        </div>
      )}
    </div>
  );
}

// ── Company Settings ────────────────────────────────────────────────────────
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

// ── Main Page ────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('ai');
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
    <div className="space-y-6">
      <div>
        <h2 className="page-title">إعدادات النظام</h2>
        <p className="page-sub mt-1">تخصيص النظام وإعداد الخدمات</p>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as Tab)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}>
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'ai'      && <AISettings />}
      {activeTab === 'email'   && <EmailSettings />}
      {activeTab === 'company' && <CompanySettings />}
    </div>
  );
}