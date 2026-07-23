import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UserIcon, PhoneIcon, MagnifyingGlassIcon,
  ChatBubbleLeftRightIcon, PencilSquareIcon, PlusIcon, XMarkIcon,
  HomeIcon, ClockIcon, FunnelIcon,
} from '@heroicons/react/24/outline';
import { clientsApi } from '../services/api.ts';
import { format, formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import toast from 'react-hot-toast';

/* ── Status ──────────────────────────────────────────────────────────────── */
const STATUS: Record<string, { label: string; bg: string; color: string; border: string }> = {
  new:               { label: 'جديد',        bg: 'rgba(59,91,219,0.08)',  color: '#3B5BDB', border: 'rgba(59,91,219,0.2)' },
  contacted:         { label: 'تم التواصل',  bg: 'rgba(99,102,241,0.08)', color: '#6366F1', border: 'rgba(99,102,241,0.2)' },
  interested:        { label: 'مهتم',        bg: 'rgba(5,150,105,0.08)',  color: '#059669', border: 'rgba(5,150,105,0.2)' },
  viewing_scheduled: { label: 'موعد معاينة', bg: 'rgba(245,158,11,0.1)',  color: '#D97706', border: 'rgba(245,158,11,0.2)' },
  negotiating:       { label: 'تفاوض',       bg: 'rgba(124,58,237,0.08)', color: '#7C3AED', border: 'rgba(124,58,237,0.2)' },
  contract_pending:  { label: 'قيد العقد',   bg: 'rgba(236,72,153,0.08)', color: '#DB2777', border: 'rgba(236,72,153,0.2)' },
  closed_won:        { label: 'مكتمل ✓',     bg: 'rgba(5,150,105,0.1)',   color: '#047857', border: 'rgba(5,150,105,0.25)' },
  closed_lost:       { label: 'خسارة',       bg: 'rgba(239,68,68,0.07)',  color: '#DC2626', border: 'rgba(239,68,68,0.18)' },
  on_hold:           { label: 'معلّق',       bg: 'rgba(100,116,139,0.08)',color: '#475569', border: 'rgba(100,116,139,0.2)' },
  follow_up:         { label: 'متابعة',      bg: 'rgba(6,182,212,0.08)',  color: '#0891B2', border: 'rgba(6,182,212,0.2)' },
};
const STATUS_OPTIONS = Object.entries(STATUS).map(([value, v]) => ({ value, label: v.label }));

const PURPOSE: Record<string, string> = { buy: 'شراء', rent: 'إيجار', invest: 'استثمار' };
const SOURCE: Record<string, string> = {
  manual: 'يدوي', whatsapp: 'واتساب', website: 'الموقع',
  referral: 'ترشيح', social_media: 'وسائل التواصل', excel_import: 'استيراد Excel',
};

/* ── Avatar gradient ─────────────────────────────────────────────────────── */
const GRADS = [
  'linear-gradient(135deg,#3B5BDB,#5273F5)',
  'linear-gradient(135deg,#7C3AED,#9B5CF6)',
  'linear-gradient(135deg,#059669,#34D399)',
  'linear-gradient(135deg,#A8892E,#C8A84B)',
  'linear-gradient(135deg,#EA580C,#FB923C)',
];
const grad = (s: string) => GRADS[(s || '?').charCodeAt(0) % GRADS.length]!;

/** Digits only, with the Saudi country code, for a wa.me link. */
const waLink = (phone?: string): string | null => {
  if (!phone) return null;
  const d = String(phone).replace(/\D/g, '');
  if (!d) return null;
  const intl = d.startsWith('966') ? d : d.replace(/^0+/, '966');
  return `https://wa.me/${intl}`;
};

/* ── Client Modal ────────────────────────────────────────────────────────── */
function ClientModal({ client, onClose }: { client?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!client;
  const [form, setForm] = useState({
    full_name:            client?.full_name ?? client?.full_name_ar ?? '',
    phone:                client?.phone ?? '',
    email:                client?.email ?? '',
    budget_max:           client?.budget_max ?? '',
    purpose:              client?.purpose ?? 'buy',
    status:               client?.status ?? 'new',
    source:               client?.source ?? 'manual',
    special_requirements: client?.special_requirements ?? '',
    notes:                client?.ai_summary ?? '',
  });
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const done = (msg: string) => {
    qc.invalidateQueries({ queryKey: ['clients'] });
    qc.invalidateQueries({ queryKey: ['client-stats'] });
    toast.success(msg);
    onClose();
  };
  const createMut = useMutation({
    mutationFn: (data: any) => clientsApi.create(data),
    onSuccess: () => done('تمت إضافة العميل'),
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'تعذّر الحفظ'),
  });
  const updateMut = useMutation({
    mutationFn: (data: any) => clientsApi.update(client.id, data),
    onSuccess: () => done('تم حفظ التعديلات'),
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'تعذّر الحفظ'),
  });
  const pending = createMut.isPending || updateMut.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      full_name:   form.full_name,
      phone:       form.phone,
      email:       form.email || undefined,
      budget_max:  form.budget_max ? parseFloat(String(form.budget_max)) : undefined,
      purpose:     form.purpose,
      status:      form.status,
      source:      form.source,
      special_requirements: form.special_requirements || undefined,
      notes:       form.notes || undefined,
    };
    if (isEdit) updateMut.mutate(payload); else createMut.mutate(payload);
  };

  const name = form.full_name || '؟';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(6,12,24,0.6)', backdropFilter: 'blur(6px)' }} onClick={onClose}>
      <div className="w-full max-w-lg max-h-[88vh] overflow-y-auto"
        style={{ background: '#fff', borderRadius: '20px', boxShadow: '0 24px 64px rgba(6,12,24,0.28)' }}
        onClick={(e) => e.stopPropagation()}>

        <div className="flex items-center justify-between px-6 py-4 sticky top-0"
          style={{ background: '#fff', borderBottom: '1px solid rgba(59,91,219,0.08)', borderRadius: '20px 20px 0 0' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
              style={{ background: grad(name) }}>{name.charAt(0)}</div>
            <div>
              <h3 className="font-bold" style={{ color: '#0F1C35' }}>
                {isEdit ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'}
              </h3>
              {isEdit && <p className="text-xs" style={{ color: '#7A8FAA' }}>{form.phone}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: '#94A3B8' }}>
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="label">الاسم *</label>
            <input required className="input w-full" value={form.full_name}
              onChange={(e) => set('full_name', e.target.value)} placeholder="اسم العميل" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">الجوال *</label>
              <input required className="input w-full" value={form.phone} dir="ltr"
                onChange={(e) => set('phone', e.target.value)} placeholder="05xxxxxxxx" />
            </div>
            <div>
              <label className="label">البريد الإلكتروني</label>
              <input type="email" className="input w-full" value={form.email} dir="ltr"
                onChange={(e) => set('email', e.target.value)} placeholder="اختياري" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">الميزانية القصوى</label>
              <input type="number" min="0" className="input w-full" value={form.budget_max}
                onChange={(e) => set('budget_max', e.target.value)} placeholder="بالريال" />
            </div>
            <div>
              <label className="label">الغرض</label>
              <select className="input w-full" value={form.purpose} onChange={(e) => set('purpose', e.target.value)}>
                {Object.entries(PURPOSE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">الحالة</label>
              <select className="input w-full" value={form.status} onChange={(e) => set('status', e.target.value)}>
                {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">المصدر</label>
              <select className="input w-full" value={form.source} onChange={(e) => set('source', e.target.value)}>
                {Object.entries(SOURCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="label">متطلبات خاصة</label>
            <input className="input w-full" value={form.special_requirements}
              onChange={(e) => set('special_requirements', e.target.value)}
              placeholder="مثال: مدخل خاص، قريب من مدرسة" />
          </div>

          <div>
            <label className="label">ملاحظات</label>
            <textarea rows={3} className="input w-full resize-none" value={form.notes}
              onChange={(e) => set('notes', e.target.value)} placeholder="ملاحظات عن العميل..." />
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold" style={{ color: '#5A6882' }}>
              إلغاء
            </button>
            <button type="submit" disabled={pending}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg,#3B5BDB,#5273F5)', boxShadow: '0 2px 8px rgba(59,91,219,0.3)' }}>
              {pending && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
              {isEdit ? 'حفظ التعديلات' : 'إضافة العميل'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Matches Modal ───────────────────────────────────────────────────────── */
function MatchesModal({ client, onClose }: { client: any; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['client-matches', client.id],
    queryFn: () => clientsApi.matches(client.id),
  });
  const properties = (data as any)?.data?.data ?? [];
  const name = client.full_name ?? client.full_name_ar ?? '؟';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(6,12,24,0.6)', backdropFilter: 'blur(6px)' }} onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto"
        style={{ background: '#fff', borderRadius: '20px', boxShadow: '0 24px 64px rgba(6,12,24,0.28)' }}
        onClick={(e) => e.stopPropagation()}>

        <div className="sticky top-0 flex items-center justify-between px-6 py-4"
          style={{ background: '#fff', borderBottom: '1px solid rgba(59,91,219,0.08)', borderRadius: '20px 20px 0 0' }}>
          <div>
            <h3 className="font-bold" style={{ color: '#0F1C35' }}>عقارات مقترحة لـ {name}</h3>
            <p className="text-xs mt-0.5" style={{ color: '#7A8FAA' }}>
              {client.budget_max
                ? `الميزانية: ${Number(client.budget_max).toLocaleString('ar-SA')} ريال`
                : 'بدون ميزانية محددة'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: '#94A3B8' }}>
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-3">
          {isLoading ? (
            [1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: 'rgba(59,91,219,0.05)' }} />
            ))
          ) : properties.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: 'rgba(59,91,219,0.06)' }}>
                <HomeIcon className="w-8 h-8" style={{ color: '#C4CEDE' }} />
              </div>
              <p className="font-semibold" style={{ color: '#5A6882' }}>لا توجد عقارات مطابقة حالياً</p>
              <p className="text-xs mt-1" style={{ color: '#94A3B8' }}>جرّب تعديل ميزانية العميل أو متطلباته</p>
            </div>
          ) : properties.map((p: any) => (
            <div key={p.id} className="rounded-xl p-4"
              style={{ background: '#fff', border: '1px solid rgba(59,91,219,0.1)' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-sm" style={{ color: '#0F1C35' }}>{p.title_ar ?? p.title}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#7A8FAA' }}>
                    {[p.district_name, p.city_name].filter(Boolean).join(' – ') || '—'}
                  </p>
                  {p.code && <p className="text-[11px] mt-1 font-mono" style={{ color: '#94A3B8' }}>{p.code}</p>}
                </div>
                {p.price != null && (
                  <span className="text-sm font-bold whitespace-nowrap" style={{ color: '#059669' }}>
                    {Number(p.price).toLocaleString('ar-SA')} ريال
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Stat card ───────────────────────────────────────────────────────────── */
function Stat({ label, value, color, bg }: { label: string; value: number | string; color: string; bg: string }) {
  return (
    <div className="rounded-2xl p-4"
      style={{ background: '#fff', border: '1px solid rgba(59,91,219,0.08)', boxShadow: '0 1px 3px rgba(6,12,24,0.05)' }}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
        <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#7A8FAA' }}>{label}</p>
      </div>
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      <div className="mt-2 h-1 rounded-full" style={{ background: bg }} />
    </div>
  );
}

/* ── Row actions (shared by table + mobile card) ─────────────────────────── */
function RowActions({ client, onEdit, onMatches }: { client: any; onEdit: () => void; onMatches: () => void }) {
  const wa = waLink(client.phone);
  return (
    <div className="flex items-center gap-1">
      <button onClick={onEdit} title="تعديل"
        className="p-1.5 rounded-lg" style={{ background: 'rgba(59,91,219,0.07)', color: '#3B5BDB' }}>
        <PencilSquareIcon className="w-4 h-4" />
      </button>
      <button onClick={onMatches} title="عقارات مقترحة"
        className="p-1.5 rounded-lg" style={{ background: 'rgba(124,58,237,0.07)', color: '#7C3AED' }}>
        <HomeIcon className="w-4 h-4" />
      </button>
      {/* Previously a dead button with no handler — now opens the chat. */}
      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" title="مراسلة على واتساب"
          className="p-1.5 rounded-lg inline-flex" style={{ background: 'rgba(5,150,105,0.07)', color: '#059669' }}>
          <ChatBubbleLeftRightIcon className="w-4 h-4" />
        </a>
      )}
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────────────── */
export default function ClientsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [purposeFilter, setPurposeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<{ open: boolean; client?: any }>({ open: false });
  const [matchesClient, setMatchesClient] = useState<any>(null);
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['clients', statusFilter, purposeFilter, search, page],
    queryFn: () => clientsApi.list({
      status:  statusFilter  || undefined,
      purpose: purposeFilter || undefined,
      search:  search        || undefined,
      page, limit: 15,
    }),
  });
  const { data: statsRes } = useQuery({
    queryKey: ['client-stats'],
    queryFn: () => clientsApi.stats(),
  });

  const clients    = (data as any)?.data?.data ?? [];
  const pagination = (data as any)?.data?.pagination;
  const stats      = (statsRes as any)?.data?.data;

  const activeFilters = [statusFilter, purposeFilter].filter(Boolean).length;
  const resetFilters = () => { setStatusFilter(''); setPurposeFilter(''); setPage(1); };

  return (
    <div className="space-y-5">
      {modal.open && <ClientModal client={modal.client} onClose={() => setModal({ open: false })} />}
      {matchesClient && <MatchesModal client={matchesClient} onClose={() => setMatchesClient(null)} />}

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="page-title">إدارة العملاء</h2>
          <p className="page-sub mt-1">
            {pagination?.total != null
              ? `${Number(pagination.total).toLocaleString('ar-SA')} عميل`
              : 'جاري التحميل...'}
          </p>
        </div>
        <button className="btn-primary" onClick={() => setModal({ open: true })}>
          <PlusIcon className="w-4 h-4" />
          عميل جديد
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="الإجمالي" value={stats?.total ?? '—'}      color="#3B5BDB" bg="rgba(59,91,219,0.12)" />
        <Stat label="جديد"     value={stats?.new ?? '—'}        color="#6366F1" bg="rgba(99,102,241,0.12)" />
        <Stat label="نشط"      value={stats?.active ?? '—'}     color="#D97706" bg="rgba(245,158,11,0.15)" />
        <Stat label="مكتمل"    value={stats?.closed_won ?? '—'} color="#059669" bg="rgba(5,150,105,0.14)" />
      </div>

      {/* Search + filters */}
      <div className="rounded-2xl p-3" style={{ background: '#fff', border: '1px solid rgba(59,91,219,0.08)' }}>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#94A3B8' }} />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="بحث بالاسم أو رقم الجوال..." className="input w-full pr-9 text-sm" />
          </div>
          <button onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold flex-shrink-0 transition-all"
            style={{
              background: showFilters || activeFilters ? 'rgba(59,91,219,0.1)' : 'rgba(242,246,255,0.9)',
              color: showFilters || activeFilters ? '#3B5BDB' : '#5A6882',
            }}>
            <FunnelIcon className="w-4 h-4" />
            <span className="hidden sm:inline">تصفية</span>
            {activeFilters > 0 && (
              <span className="w-4 h-4 text-[10px] font-bold rounded-full flex items-center justify-center text-white"
                style={{ background: '#3B5BDB' }}>{activeFilters}</span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 pt-3"
            style={{ borderTop: '1px solid rgba(59,91,219,0.07)' }}>
            <div>
              <label className="label">الحالة</label>
              <select className="input w-full text-sm" value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
                <option value="">كل الحالات</option>
                {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">الغرض</label>
              <select className="input w-full text-sm" value={purposeFilter}
                onChange={(e) => { setPurposeFilter(e.target.value); setPage(1); }}>
                <option value="">كل الأغراض</option>
                {Object.entries(PURPOSE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <button onClick={resetFilters} disabled={!activeFilters}
                className="w-full py-2 rounded-xl text-sm font-semibold disabled:opacity-40"
                style={{ background: 'rgba(239,68,68,0.06)', color: '#DC2626' }}>
                مسح التصفية
              </button>
            </div>
          </div>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'rgba(59,91,219,0.05)' }} />
          ))}
        </div>
      ) : clients.length === 0 ? (
        <div className="rounded-2xl text-center py-16 px-4"
          style={{ background: '#fff', border: '1px solid rgba(59,91,219,0.08)' }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'rgba(59,91,219,0.06)' }}>
            <UserIcon className="w-8 h-8" style={{ color: '#C4CEDE' }} />
          </div>
          <p className="font-bold" style={{ color: '#0F1C35' }}>
            {search || activeFilters ? 'لا نتائج مطابقة' : 'لا يوجد عملاء بعد'}
          </p>
          <p className="text-sm mt-1" style={{ color: '#7A8FAA' }}>
            {search || activeFilters ? 'جرّب تعديل البحث أو التصفية' : 'أضف أول عميل للبدء'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden lg:block rounded-2xl overflow-hidden"
            style={{ background: '#fff', border: '1px solid rgba(59,91,219,0.08)', boxShadow: '0 1px 3px rgba(6,12,24,0.05)' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-right" style={{ minWidth: '820px' }}>
                <thead>
                  <tr style={{ background: 'rgba(242,246,255,0.7)' }}>
                    {['العميل', 'الجوال', 'الميزانية', 'الغرض', 'الحالة', 'آخر تواصل', ''].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide"
                        style={{ color: '#7A8FAA' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c: any) => {
                    const sc = STATUS[c.status] ?? { label: c.status, bg: 'rgba(100,116,139,0.08)', color: '#475569', border: 'transparent' };
                    const name = c.full_name ?? c.full_name_ar ?? '؟';
                    return (
                      <tr key={c.id} className="transition-colors" style={{ borderTop: '1px solid rgba(59,91,219,0.06)' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(59,91,219,0.02)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                              style={{ background: grad(name) }}>{name.charAt(0)}</div>
                            <div className="min-w-0">
                              <p className="font-semibold text-sm leading-tight truncate" style={{ color: '#0F1C35' }}>{name}</p>
                              <p className="text-[11px]" style={{ color: '#94A3B8' }}>{SOURCE[c.source] ?? c.source ?? '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 text-sm" style={{ color: '#5A6882' }}>
                            <PhoneIcon className="w-3.5 h-3.5" />
                            <span dir="ltr">{c.phone}</span>
                          </a>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {c.budget_max
                            ? <span className="font-semibold" style={{ color: '#0F1C35' }}>{Number(c.budget_max).toLocaleString('ar-SA')}</span>
                            : <span style={{ color: '#C4CEDE' }}>—</span>}
                        </td>
                        <td className="px-4 py-3 text-sm" style={{ color: '#5A6882' }}>{PURPOSE[c.purpose] ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full"
                            style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
                            {sc.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: '#94A3B8' }}>
                          {c.last_contact_at ? (
                            <span title={format(new Date(c.last_contact_at), 'dd/MM/yyyy HH:mm', { locale: ar })}>
                              <ClockIcon className="w-3.5 h-3.5 inline ml-1" />
                              {formatDistanceToNow(new Date(c.last_contact_at), { locale: ar, addSuffix: true })}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <RowActions client={c} onEdit={() => setModal({ open: true, client: c })}
                            onMatches={() => setMatchesClient(c)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards — a 7-column table is unusable on a phone */}
          <div className="lg:hidden space-y-2">
            {clients.map((c: any) => {
              const sc = STATUS[c.status] ?? { label: c.status, bg: 'rgba(100,116,139,0.08)', color: '#475569', border: 'transparent' };
              const name = c.full_name ?? c.full_name_ar ?? '؟';
              return (
                <div key={c.id} className="rounded-2xl p-3"
                  style={{ background: '#fff', border: '1px solid rgba(59,91,219,0.08)' }}>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
                      style={{ background: grad(name) }}>{name.charAt(0)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-bold text-sm truncate" style={{ color: '#0F1C35' }}>{name}</p>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                          style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
                      </div>
                      <a href={`tel:${c.phone}`} className="text-xs font-mono" dir="ltr" style={{ color: '#3B5BDB' }}>{c.phone}</a>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px]" style={{ color: '#7A8FAA' }}>
                        {c.budget_max && <span>{Number(c.budget_max).toLocaleString('ar-SA')} ر.س</span>}
                        {c.purpose && <span>{PURPOSE[c.purpose]}</span>}
                      </div>
                      <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(59,91,219,0.06)' }}>
                        <RowActions client={c} onEdit={() => setModal({ open: true, client: c })}
                          onMatches={() => setMatchesClient(c)} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Pagination */}
      {pagination && pagination.total_pages > 1 && (
        <div className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3"
          style={{ background: '#fff', border: '1px solid rgba(59,91,219,0.08)' }}>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
            className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-40"
            style={{ background: 'rgba(59,91,219,0.07)', color: '#3B5BDB' }}>
            السابق
          </button>
          <span className="text-sm font-semibold" style={{ color: '#5A6882' }}>
            صفحة {page} من {pagination.total_pages}
          </span>
          <button onClick={() => setPage((p) => p + 1)} disabled={page >= pagination.total_pages}
            className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-40"
            style={{ background: 'rgba(59,91,219,0.07)', color: '#3B5BDB' }}>
            التالي
          </button>
        </div>
      )}
    </div>
  );
}
