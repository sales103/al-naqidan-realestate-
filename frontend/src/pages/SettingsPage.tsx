import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  EnvelopeIcon, CheckCircleIcon, ExclamationCircleIcon,
  EyeIcon, EyeSlashIcon, CpuChipIcon,
  BuildingOfficeIcon, ClockIcon, SparklesIcon,
  ShieldCheckIcon, GlobeAltIcon, PhoneIcon,
  CheckIcon, XMarkIcon, PaperAirplaneIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { settingsApi, api } from '../services/api.ts';
import { useAuthStore } from '../store/auth.store.ts';

const TABS = [
  {
    id: 'ai',
    label: 'الذكاء الاصطناعي',
    icon: CpuChipIcon,
    desc: 'مزود AI، النموذج، ساعات العمل',
    color: '#3B5BDB',
    bg: 'rgba(59,91,219,0.08)',
  },
  {
    id: 'email',
    label: 'البريد الإلكتروني',
    icon: EnvelopeIcon,
    desc: 'SMTP، إرسال OTP والإشعارات',
    color: '#059669',
    bg: 'rgba(5,150,105,0.08)',
  },
  {
    id: 'company',
    label: 'بيانات الشركة',
    icon: BuildingOfficeIcon,
    desc: 'الاسم، العنوان، بيانات التواصل',
    color: '#C8A84B',
    bg: 'rgba(200,168,75,0.1)',
  },
] as const;

type Tab = typeof TABS[number]['id'];

/* ── Shared Toggle ──────────────────────────────────────────────────────────── */
function Toggle({ on, onChange, label, desc }: { on: boolean; onChange: (v: boolean) => void; label: string; desc?: string }) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl" style={{
      background: on ? 'rgba(59,91,219,0.05)' : 'rgba(242,246,255,0.6)',
      border: `1px solid ${on ? 'rgba(59,91,219,0.12)' : 'rgba(59,91,219,0.06)'}`,
      transition: 'all 0.2s ease',
    }}>
      <div>
        <p className="text-sm font-semibold" style={{ color: '#0F1C35' }}>{label}</p>
        {desc && <p className="text-xs mt-0.5" style={{ color: '#7A8FAA' }}>{desc}</p>}
      </div>
      <button type="button" onClick={() => onChange(!on)}
        className="relative flex-shrink-0 transition-all duration-300"
        style={{
          width: '48px', height: '26px', borderRadius: '999px',
          background: on ? 'linear-gradient(135deg, #3B5BDB, #5273F5)' : '#D1D9EC',
          boxShadow: on ? '0 2px 8px rgba(59,91,219,0.35)' : 'none',
        }}>
        <span style={{
          position: 'absolute', top: '3px',
          width: '20px', height: '20px', borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
          transition: 'all 0.25s ease',
          right: on ? '3px' : 'calc(100% - 23px)',
        }} />
      </button>
    </div>
  );
}

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

/* ── AI Settings ────────────────────────────────────────────────────────────── */
function AISettings() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    openai_key: '', openai_model: 'llama-3.3-70b-versatile', base_url: '',
    system_prompt: '', work_start: '08:00', work_end: '22:00',
    auto_respond: true, respect_hours: true, max_tokens: '500', temperature: '0.3',
  });
  const [showKey, setShowKey] = useState(false);
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const { data, isLoading } = useQuery({ queryKey: ['settings', 'ai'], queryFn: () => settingsApi.get('ai') });
  const keyIsSaved = Boolean((data as any)?.data?.data?.openai_key_set);

  useEffect(() => {
    const v = (data as any)?.data?.data;
    if (v) setForm({
      openai_key: '', openai_model: v.model ?? 'llama-3.3-70b-versatile',
      base_url: v.base_url ?? '', system_prompt: v.system_prompt ?? '',
      work_start: v.work_start ?? '08:00', work_end: v.work_end ?? '22:00',
      auto_respond: v.auto_respond ?? true, respect_hours: v.respect_hours ?? true,
      max_tokens: String(v.max_tokens ?? 500), temperature: String(v.temperature ?? 0.3),
    });
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () => settingsApi.save('ai', {
      model: form.openai_model, base_url: form.base_url || undefined,
      system_prompt: form.system_prompt || undefined,
      work_start: form.work_start, work_end: form.work_end,
      auto_respond: form.auto_respond, respect_hours: form.respect_hours,
      max_tokens: parseInt(form.max_tokens) || 500,
      temperature: parseFloat(form.temperature) || 0.3,
      ...(form.openai_key ? { openai_key: form.openai_key } : {}),
    }),
    onSuccess: () => { toast.success('تم حفظ إعدادات الذكاء الاصطناعي'); qc.invalidateQueries({ queryKey: ['settings'] }); },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'فشل الحفظ'),
  });

  if (isLoading) return <LoadingPulse />;

  const PROVIDERS = [
    {
      value: 'groq', label: 'Groq', badge: 'مجاني وسريع',
      url: 'https://api.groq.com/openai/v1', color: '#F97316',
      models: [
        { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', badge: 'موصى به' },
        { value: 'llama-3.1-8b-instant',    label: 'Llama 3.1 8B',  badge: 'الأسرع' },
        { value: 'mixtral-8x7b-32768',      label: 'Mixtral 8x7B',  badge: '' },
      ],
    },
    {
      value: 'openai', label: 'OpenAI', badge: 'مدفوع',
      url: '', color: '#10A37F',
      models: [
        { value: 'gpt-4o',      label: 'GPT-4o',      badge: 'الأذكى' },
        { value: 'gpt-4o-mini', label: 'GPT-4o Mini', badge: 'موصى به' },
        { value: 'gpt-3.5-turbo', label: 'GPT-3.5',   badge: 'الأسرع' },
      ],
    },
  ];

  const isGroq = form.base_url?.includes('groq.com') || (!form.base_url && form.openai_model.includes('llama'));
  const currentProvider = isGroq ? PROVIDERS[0] : PROVIDERS[1];

  return (
    <div className="space-y-5 max-w-2xl">

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl" style={{
        background: 'rgba(59,91,219,0.06)', border: '1px solid rgba(59,91,219,0.12)',
      }}>
        <SparklesIcon className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#3B5BDB' }} />
        <div className="text-sm" style={{ color: '#1A2E50' }}>
          <p className="font-bold mb-0.5">كيف يعمل؟</p>
          <p style={{ color: '#5A6882', lineHeight: 1.6 }}>
            النظام يستقبل رسائل واتساب، يحللها بـ AI، يبحث في قاعدة العقارات، ويرد بشكل احترافي تلقائياً. يمكن إيقافه لأي محادثة من صفحة المحادثات.
          </p>
        </div>
      </div>

      {/* Section 1: Provider */}
      <Section num={1} title="مزود الذكاء الاصطناعي" color="#3B5BDB">
        <div className="grid grid-cols-2 gap-3">
          {PROVIDERS.map(p => {
            const isActive = p.value === 'groq' ? isGroq : !isGroq;
            return (
              <button key={p.value} type="button"
                onClick={() => { set('base_url', p.url); set('openai_model', p.models[0].value); }}
                className="p-4 rounded-xl border-2 text-right transition-all duration-200"
                style={{
                  borderColor: isActive ? p.color : 'rgba(59,91,219,0.1)',
                  background: isActive ? `${p.color}10` : '#fff',
                  boxShadow: isActive ? `0 2px 12px ${p.color}25` : 'none',
                }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{
                    background: isActive ? `${p.color}20` : 'rgba(59,91,219,0.06)',
                    color: isActive ? p.color : '#7A8FAA',
                  }}>{p.badge}</span>
                  {isActive && <CheckCircleIcon className="w-4 h-4" style={{ color: p.color }} />}
                </div>
                <p className="font-bold" style={{ color: isActive ? p.color : '#0F1C35' }}>{p.label}</p>
              </button>
            );
          })}
        </div>

        {/* API Key */}
        <div>
          <label className="label flex items-center gap-2">
            API Key
            {keyIsSaved && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(5,150,105,0.1)', color: '#059669' }}>
                ✓ مفتاح محفوظ
              </span>
            )}
          </label>
          <div className="relative">
            <input value={form.openai_key} onChange={e => set('openai_key', e.target.value)}
              type={showKey ? 'text' : 'password'} className="input pl-10 font-mono text-sm"
              placeholder={keyIsSaved ? '•••••••••• (اتركه فارغاً للإبقاء على المفتاح الحالي)' : 'الصق المفتاح هنا...'} dir="ltr" />
            <button type="button" onClick={() => setShowKey(!showKey)}
              className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#94A3B8' }}>
              {showKey ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs mt-1.5" style={{ color: '#7A8FAA' }}>
            احصل على مفتاحك من{' '}
            <span className="font-mono px-1.5 py-0.5 rounded" style={{ background: 'rgba(59,91,219,0.07)', color: '#3B5BDB' }}>
              {isGroq ? 'console.groq.com/keys' : 'platform.openai.com/api-keys'}
            </span>
          </p>
        </div>

        {/* Model */}
        <div>
          <label className="label">النموذج</label>
          <div className="space-y-2">
            {currentProvider.models.map(m => (
              <button key={m.value} type="button" onClick={() => set('openai_model', m.value)}
                className="w-full flex items-center justify-between p-3 rounded-xl border transition-all"
                style={{
                  borderColor: form.openai_model === m.value ? '#3B5BDB' : 'rgba(59,91,219,0.08)',
                  background: form.openai_model === m.value ? 'rgba(59,91,219,0.05)' : '#fff',
                }}>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center" style={{
                    borderColor: form.openai_model === m.value ? '#3B5BDB' : '#D1D9EC',
                  }}>
                    {form.openai_model === m.value && (
                      <div className="w-2 h-2 rounded-full" style={{ background: '#3B5BDB' }} />
                    )}
                  </div>
                  <span className="text-sm font-semibold" style={{ color: '#0F1C35' }}>{m.label}</span>
                </div>
                {m.badge && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{
                    background: form.openai_model === m.value ? 'rgba(59,91,219,0.12)' : 'rgba(59,91,219,0.06)',
                    color: form.openai_model === m.value ? '#3B5BDB' : '#7A8FAA',
                  }}>{m.badge}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </Section>

      {/* Section 2: Hours */}
      <Section num={2} title="ساعات العمل" color="#C8A84B">
        <Toggle on={form.auto_respond} onChange={v => set('auto_respond', v)}
          label="الرد التلقائي" desc="AI يرد على رسائل واتساب تلقائياً" />
        <Toggle on={form.respect_hours} onChange={v => set('respect_hours', v)}
          label="احترام ساعات العمل" desc="يتوقف AI عن الرد خارج أوقات الدوام" />

        {form.respect_hours && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label flex items-center gap-1.5">
                <ClockIcon className="w-3.5 h-3.5" style={{ color: '#059669' }} />
                بداية العمل
              </label>
              <input type="time" className="input" value={form.work_start}
                onChange={e => set('work_start', e.target.value)} dir="ltr" />
            </div>
            <div>
              <label className="label flex items-center gap-1.5">
                <ClockIcon className="w-3.5 h-3.5" style={{ color: '#EF4444' }} />
                نهاية العمل
              </label>
              <input type="time" className="input" value={form.work_end}
                onChange={e => set('work_end', e.target.value)} dir="ltr" />
            </div>
          </div>
        )}
      </Section>

      {/* Section 3: Behavior */}
      <Section num={3} title="سلوك الذكاء الاصطناعي" color="#7C3AED">
        <div className="grid grid-cols-2 gap-5">
          <div>
            <label className="label">الحد الأقصى للرد</label>
            <input type="number" min="100" max="2000" step="50"
              value={form.max_tokens} onChange={e => set('max_tokens', e.target.value)}
              className="input" dir="ltr" />
            <p className="text-xs mt-1" style={{ color: '#7A8FAA' }}>500 كلمة مناسبة لمعظم الردود</p>
          </div>
          <div>
            <label className="label">درجة الإبداعية</label>
            <div className="mt-2">
              <input type="range" min="0" max="1" step="0.1"
                value={form.temperature} onChange={e => set('temperature', e.target.value)}
                className="w-full" style={{ accentColor: '#7C3AED' }} />
              <div className="flex justify-between mt-1.5 text-xs" style={{ color: '#7A8FAA' }}>
                <span>دقيق (0)</span>
                <span className="font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(124,58,237,0.1)', color: '#7C3AED' }}>
                  {form.temperature}
                </span>
                <span>مبدع (1)</span>
              </div>
            </div>
          </div>
        </div>

        <div>
          <label className="label">System Prompt مخصص (اختياري)</label>
          <textarea className="input w-full resize-none font-mono text-xs leading-relaxed" rows={7}
            value={form.system_prompt} onChange={e => set('system_prompt', e.target.value)}
            placeholder={`اتركه فارغاً لاستخدام البرومبت الافتراضي المدمج في النظام.\n\nمثال:\nأنت مساعد عقاري ذكي لمكتب النقيدان العقاري في بريدة.\nتتحدث بالعربية بأسلوب مهني ودود.\nتساعد العملاء في إيجاد العقارات المناسبة...`} />
          <p className="text-xs mt-1.5" style={{ color: '#7A8FAA' }}>يُضاف هذا النص في بداية كل محادثة ليحدد شخصية وسلوك الذكاء الاصطناعي</p>
        </div>
      </Section>

      <SaveBtn pending={saveMut.isPending} label="حفظ إعدادات الذكاء الاصطناعي" onClick={() => saveMut.mutate()} />
    </div>
  );
}

/* ── Email Settings ─────────────────────────────────────────────────────────── */
function EmailSettings() {
  const qc = useQueryClient();
  const [provider, setProvider] = useState<'resend' | 'smtp'>('resend');
  const [form, setForm] = useState({
    host: '', port: '587', user: '', password: '', from: '', from_name: '',
    resend_api_key: '', resend_from: '',
  });
  const [showPass, setShowPass] = useState(false);
  const [showResendKey, setShowResendKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const { data, isLoading } = useQuery({ queryKey: ['settings', 'smtp'], queryFn: () => settingsApi.get('smtp') });
  const resendKeyIsSaved = Boolean((data as any)?.data?.data?.resend_api_key_set);

  useEffect(() => {
    const v = (data as any)?.data?.data;
    if (v) {
      setProvider(v.provider === 'smtp' ? 'smtp' : 'resend');
      setForm({
        host: v.host ?? 'smtp.gmail.com', port: String(v.port ?? 587),
        user: v.user ?? '', password: '', from: v.from ?? '', from_name: v.from_name ?? '',
        resend_api_key: '', resend_from: v.resend_from ?? '',
      });
    }
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () => settingsApi.save('smtp', {
      provider,
      // SMTP fields
      host: form.host, port: Number(form.port), user: form.user,
      ...(form.password ? { password: form.password } : {}),
      // Resend fields
      ...(form.resend_api_key ? { resend_api_key: form.resend_api_key } : {}),
      resend_from: form.resend_from || undefined,
      // Shared
      from: form.from || form.user, from_name: form.from_name || 'مكتب النقيدان',
    }),
    onSuccess: () => { toast.success('تم حفظ إعدادات البريد'); qc.invalidateQueries({ queryKey: ['settings'] }); },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'فشل الحفظ'),
  });

  const testEmail = async () => {
    const testTo = form.from || form.user;
    if (!testTo) { toast.error('أدخل البريد الإلكتروني أولاً'); return; }
    setTesting(true); setTestResult(null);
    try {
      await api.post('/settings/test-email', { to: testTo });
      setTestResult({ ok: true, msg: 'تم إرسال بريد تجريبي — تحقق من صندوقك' });
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.response?.data?.error ?? 'فشل الإرسال — تحقق من الإعدادات' });
    } finally { setTesting(false); }
  };

  if (isLoading) return <LoadingPulse />;

  const smtpPresets = [
    { label: 'Gmail',   host: 'smtp.gmail.com',     port: '587', color: '#EA4335' },
    { label: 'Outlook', host: 'smtp.office365.com',  port: '587', color: '#0078D4' },
    { label: 'Yahoo',   host: 'smtp.mail.yahoo.com', port: '465', color: '#6001D2' },
  ];

  return (
    <div className="space-y-5 max-w-2xl">

      <div className="flex items-start gap-3 p-4 rounded-xl" style={{ background: 'rgba(5,150,105,0.06)', border: '1px solid rgba(5,150,105,0.12)' }}>
        <EnvelopeIcon className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#059669' }} />
        <div className="text-sm">
          <p className="font-bold mb-0.5" style={{ color: '#0F1C35' }}>كيف يعمل البريد؟</p>
          <p style={{ color: '#5A6882', lineHeight: 1.6 }}>يُستخدم لإرسال رموز التحقق (OTP) عند تسجيل الموظفين وإعادة تعيين كلمة المرور.</p>
        </div>
      </div>

      {/* Provider Selection */}
      <Section num={1} title="طريقة الإرسال" color="#059669">
        <div className="grid grid-cols-2 gap-3">
          {([
            { id: 'resend' as const, label: 'Resend', badge: 'موصى به', desc: 'يعمل على جميع الاستضافات', color: '#000' },
            { id: 'smtp' as const, label: 'SMTP', badge: 'تقليدي', desc: 'Gmail / Outlook / Yahoo', color: '#3B5BDB' },
          ]).map(p => {
            const active = provider === p.id;
            return (
              <button key={p.id} type="button" onClick={() => setProvider(p.id)}
                className="p-4 rounded-xl border-2 text-right transition-all duration-200"
                style={{
                  borderColor: active ? p.color : 'rgba(59,91,219,0.1)',
                  background: active ? `${p.color}08` : '#fff',
                  boxShadow: active ? `0 2px 12px ${p.color}15` : 'none',
                }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{
                    background: active ? `${p.color}15` : 'rgba(59,91,219,0.06)',
                    color: active ? p.color : '#7A8FAA',
                  }}>{p.badge}</span>
                  {active && <CheckCircleIcon className="w-4 h-4" style={{ color: p.color }} />}
                </div>
                <p className="font-bold" style={{ color: active ? p.color : '#0F1C35' }}>{p.label}</p>
                <p className="text-xs mt-0.5" style={{ color: '#7A8FAA' }}>{p.desc}</p>
              </button>
            );
          })}
        </div>
      </Section>

      {/* Resend Settings */}
      {provider === 'resend' && (
        <Section num={2} title="إعدادات Resend" color="#059669">
          <div>
            <label className="label flex items-center gap-2">
              API Key
              {resendKeyIsSaved && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(5,150,105,0.1)', color: '#059669' }}>
                  ✓ مفتاح محفوظ
                </span>
              )}
            </label>
            <div className="relative">
              <input value={form.resend_api_key} onChange={e => set('resend_api_key', e.target.value)}
                type={showResendKey ? 'text' : 'password'} className="input pl-10 font-mono text-sm"
                placeholder={resendKeyIsSaved ? '•••••••••• (اتركه فارغاً للإبقاء على المفتاح)' : 're_xxxxxxxxx...'} dir="ltr" />
              <button type="button" onClick={() => setShowResendKey(!showResendKey)}
                className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#94A3B8' }}>
                {showResendKey ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="label">بريد الإرسال (From)</label>
            <input value={form.resend_from} onChange={e => set('resend_from', e.target.value)}
              className="input" dir="ltr" type="email"
              placeholder="onboarding@resend.dev (مجاني) أو you@yourdomain.com" />
            <p className="text-xs mt-1.5" style={{ color: '#7A8FAA' }}>
              المجاني يرسل من <span className="font-mono" style={{ color: '#059669' }}>onboarding@resend.dev</span> — لاستخدام دومينك الخاص أضفه في لوحة Resend
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">بريد الرد (Reply-To)</label>
              <input value={form.from} onChange={e => set('from', e.target.value)} className="input" dir="ltr" type="email" placeholder="office@company.com" />
              <p className="text-xs mt-1" style={{ color: '#7A8FAA' }}>عندما يرد الموظف، يصل الرد لهذا البريد</p>
            </div>
            <div>
              <label className="label">اسم المرسل</label>
              <input value={form.from_name} onChange={e => set('from_name', e.target.value)} className="input" placeholder="مكتب النقيدان" />
            </div>
          </div>

          <div className="p-4 rounded-xl" style={{ background: 'rgba(5,150,105,0.05)', border: '1px solid rgba(5,150,105,0.12)' }}>
            <p className="font-bold text-sm mb-2" style={{ color: '#059669' }}>خطوات إعداد Resend (مجاني)</p>
            <ol className="space-y-1.5 text-sm" style={{ color: '#5A6882' }}>
              {[
                <>اذهب إلى <span className="font-mono px-1.5 rounded" style={{ background: 'rgba(5,150,105,0.1)', color: '#059669' }}>resend.com</span> وأنشئ حساب مجاني</>,
                'من القائمة اختر API Keys ← أنشئ مفتاح جديد',
                'انسخ المفتاح والصقه في حقل API Key أعلاه',
                'جاهز! يرسل 100 بريد/يوم مجاناً ويعمل على أي استضافة',
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5"
                    style={{ background: 'rgba(5,150,105,0.15)', color: '#059669' }}>{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </Section>
      )}

      {/* SMTP Settings */}
      {provider === 'smtp' && (
        <Section num={2} title="إعدادات SMTP" color="#3B5BDB">
          <div className="flex gap-2 flex-wrap">
            {smtpPresets.map(p => {
              const active = form.host === p.host;
              return (
                <button key={p.label} type="button"
                  onClick={() => { set('host', p.host); set('port', p.port); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 text-sm font-semibold transition-all"
                  style={{
                    borderColor: active ? p.color : 'rgba(59,91,219,0.1)',
                    background: active ? `${p.color}10` : '#fff',
                    color: active ? p.color : '#5A6882',
                    boxShadow: active ? `0 2px 8px ${p.color}25` : 'none',
                  }}>
                  {active && <CheckIcon className="w-3.5 h-3.5" />}
                  {p.label}
                </button>
              );
            })}
          </div>

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
                className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#94A3B8' }}>
                {showPass ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">بريد الإرسال (From)</label>
              <input value={form.from} onChange={e => set('from', e.target.value)} className="input" dir="ltr" type="email" placeholder="noreply@company.com" />
            </div>
            <div>
              <label className="label">اسم المرسل</label>
              <input value={form.from_name} onChange={e => set('from_name', e.target.value)} className="input" placeholder="مكتب النقيدان" />
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
            <ExclamationCircleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#DC2626' }} />
            <p style={{ color: '#7A3030' }}>
              بعض الاستضافات (مثل Railway) تحظر منافذ SMTP. إذا فشل الإرسال، استخدم Resend بدلاً من ذلك.
            </p>
          </div>

          {form.host === 'smtp.gmail.com' && (
            <div className="p-4 rounded-xl" style={{ background: 'rgba(200,168,75,0.07)', border: '1px solid rgba(200,168,75,0.18)' }}>
              <p className="font-bold text-sm mb-2" style={{ color: '#A8892E' }}>خطوات Gmail App Password</p>
              <ol className="space-y-1.5 text-sm" style={{ color: '#5A6882' }}>
                {[
                  <>اذهب إلى <span className="font-mono px-1.5 rounded" style={{ background: 'rgba(200,168,75,0.12)', color: '#A8892E' }}>myaccount.google.com</span></>,
                  'الأمان ← التحقق بخطوتين ← فعّله',
                  'ابحث عن "App passwords"',
                  'اختر "Other" واكتب اسم التطبيق',
                  'انسخ الـ 16 حرف والصقها في حقل كلمة المرور',
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5"
                      style={{ background: 'rgba(200,168,75,0.2)', color: '#A8892E' }}>{i + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Section>
      )}

      {testResult && (
        <div className="flex items-center gap-2.5 p-3.5 rounded-xl text-sm font-medium" style={{
          background: testResult.ok ? 'rgba(5,150,105,0.08)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${testResult.ok ? 'rgba(5,150,105,0.2)' : 'rgba(239,68,68,0.2)'}`,
          color: testResult.ok ? '#059669' : '#DC2626',
        }}>
          {testResult.ok
            ? <CheckCircleIcon className="w-5 h-5 flex-shrink-0" />
            : <XMarkIcon className="w-5 h-5 flex-shrink-0" />}
          {testResult.msg}
        </div>
      )}

      <div className="flex gap-3">
        <SaveBtn pending={saveMut.isPending} label="حفظ الإعدادات" onClick={() => saveMut.mutate()} />
        <button onClick={testEmail} disabled={testing}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl transition-all disabled:opacity-60"
          style={{ background: 'rgba(5,150,105,0.08)', color: '#059669', border: '1px solid rgba(5,150,105,0.2)' }}>
          <PaperAirplaneIcon className="w-4 h-4" />
          {testing ? 'جاري الإرسال...' : 'إرسال تجريبي'}
        </button>
      </div>
    </div>
  );
}

/* ── Company Settings ───────────────────────────────────────────────────────── */
function CompanySettings() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', name_ar: '', phone: '', address: '', website: '' });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const { data } = useQuery({ queryKey: ['settings', 'company'], queryFn: () => settingsApi.get('company') });

  useEffect(() => {
    const v = (data as any)?.data?.data;
    if (v) setForm({ name: v.name ?? '', name_ar: v.name_ar ?? '', phone: v.phone ?? '', address: v.address ?? '', website: v.website ?? '' });
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () => settingsApi.save('company', form),
    onSuccess: () => { toast.success('تم حفظ بيانات الشركة'); qc.invalidateQueries({ queryKey: ['settings'] }); },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'فشل الحفظ'),
  });

  const fields = [
    { key: 'name_ar', label: 'اسم الشركة (عربي)', placeholder: 'مكتب عبدالحكيم النقيدان العقاري', icon: BuildingOfficeIcon, ltr: false },
    { key: 'name',    label: 'Company Name (English)', placeholder: 'Al-Naqidan Real Estate', icon: GlobeAltIcon, ltr: true },
    { key: 'phone',   label: 'رقم الهاتف',  placeholder: '+966 5X XXX XXXX', icon: PhoneIcon, ltr: true },
    { key: 'address', label: 'العنوان',     placeholder: 'بريدة، القصيم، المملكة العربية السعودية', icon: BuildingOfficeIcon, ltr: false },
    { key: 'website', label: 'الموقع الإلكتروني', placeholder: 'https://naqidan.com', icon: GlobeAltIcon, ltr: true },
  ];

  return (
    <div className="space-y-5 max-w-2xl">

      {/* Preview Card */}
      {(form.name_ar || form.name) && (
        <div className="p-4 rounded-2xl" style={{
          background: 'linear-gradient(135deg, #060C18, #0B1525)',
          border: '1px solid rgba(200,168,75,0.15)',
        }}>
          <p className="text-xs font-bold mb-3 tracking-widest uppercase" style={{ color: 'rgba(200,168,75,0.5)' }}>معاينة الهوية</p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{
              background: 'linear-gradient(135deg, #A8892E, #C8A84B)',
              boxShadow: '0 2px 10px rgba(200,168,75,0.3)',
            }}>
              <BuildingOfficeIcon className="w-5 h-5" style={{ color: '#1a0f00' }} />
            </div>
            <div>
              <p className="font-bold text-sm" style={{ color: '#E8EDF5' }}>{form.name_ar || 'اسم الشركة'}</p>
              <p className="text-xs" style={{ color: 'rgba(200,168,75,0.6)' }}>{form.name || 'Company Name'}</p>
            </div>
          </div>
        </div>
      )}

      <Section num={1} title="معلومات الشركة" color="#C8A84B">
        <div className="grid grid-cols-1 gap-4">
          {fields.map(f => {
            const Icon = f.icon;
            return (
              <div key={f.key}>
                <label className="label flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5" style={{ color: '#7A8FAA' }} />
                  {f.label}
                </label>
                <input
                  value={(form as any)[f.key]}
                  onChange={e => set(f.key, e.target.value)}
                  className="input"
                  placeholder={f.placeholder}
                  dir={f.ltr ? 'ltr' : 'rtl'}
                />
              </div>
            );
          })}
        </div>
      </Section>

      <SaveBtn pending={saveMut.isPending} label="حفظ بيانات الشركة" onClick={() => saveMut.mutate()} />
    </div>
  );
}

/* ── Loading ────────────────────────────────────────────────────────────────── */
function LoadingPulse() {
  return (
    <div className="space-y-4 max-w-2xl animate-pulse">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(59,91,219,0.08)' }}>
          <div className="h-12" style={{ background: 'rgba(242,246,255,0.8)' }} />
          <div className="p-6 space-y-3">
            <div className="h-4 rounded-lg w-1/3" style={{ background: 'rgba(59,91,219,0.07)' }} />
            <div className="h-10 rounded-xl" style={{ background: 'rgba(59,91,219,0.05)' }} />
            <div className="h-4 rounded-lg w-2/3" style={{ background: 'rgba(59,91,219,0.04)' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────────────────────────── */
export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('ai');
  const user = useAuthStore(s => s.user);

  if (!['super_admin', 'admin'].includes(user?.role ?? '')) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
            <ShieldCheckIcon className="w-8 h-8" style={{ color: '#EF4444' }} />
          </div>
          <p className="font-bold" style={{ color: '#0F1C35' }}>هذه الصفحة للمدير فقط</p>
          <p className="text-sm mt-1" style={{ color: '#7A8FAA' }}>لا تملك صلاحية الوصول إلى إعدادات النظام</p>
        </div>
      </div>
    );
  }

  const activeTabData = TABS.find(t => t.id === activeTab)!;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h2 className="page-title">إعدادات النظام</h2>
        <p className="page-sub">تخصيص النظام، مزودي الخدمات، وبيانات الشركة</p>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-3 flex-wrap">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as Tab)}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all duration-200 text-right"
              style={{
                borderColor: isActive ? tab.color : 'rgba(59,91,219,0.1)',
                background: isActive ? tab.bg : '#fff',
                boxShadow: isActive ? `0 2px 12px ${tab.color}20` : 'none',
              }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{
                background: isActive ? `${tab.color}18` : 'rgba(242,246,255,0.8)',
              }}>
                <Icon className="w-4 h-4" style={{ color: isActive ? tab.color : '#7A8FAA' }} />
              </div>
              <div className="text-right">
                <p className="text-sm font-bold leading-tight" style={{ color: isActive ? tab.color : '#0F1C35' }}>{tab.label}</p>
                <p className="text-xs mt-0.5 hidden sm:block" style={{ color: '#7A8FAA' }}>{tab.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Section indicator */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{
        background: activeTabData.bg,
        border: `1px solid ${activeTabData.color}25`,
      }}>
        <activeTabData.icon className="w-4 h-4 flex-shrink-0" style={{ color: activeTabData.color }} />
        <span className="text-sm font-semibold" style={{ color: activeTabData.color }}>{activeTabData.label}</span>
        <span style={{ color: `${activeTabData.color}60` }}>—</span>
        <span className="text-sm" style={{ color: `${activeTabData.color}90` }}>{activeTabData.desc}</span>
      </div>

      {activeTab === 'ai'      && <AISettings />}
      {activeTab === 'email'   && <EmailSettings />}
      {activeTab === 'company' && <CompanySettings />}
    </div>
  );
}
