import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UserIcon, PhoneIcon, MagnifyingGlassIcon,
  ChatBubbleLeftRightIcon, PencilSquareIcon, PlusIcon, XMarkIcon,
  HomeIcon, CurrencyDollarIcon, ClockIcon, FunnelIcon,
} from '@heroicons/react/24/outline';
import { clientsApi } from '../services/api.ts';
import { format, formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import toast from 'react-hot-toast';

const statusConfig: Record<string, { label: string; color: string; dot: string }> = {
  new:               { label: 'جديد',         color: 'bg-blue-100 text-blue-700',       dot: 'bg-blue-500'   },
  contacted:         { label: 'تواصل',         color: 'bg-purple-100 text-purple-700',   dot: 'bg-purple-500' },
  interested:        { label: 'مهتم',          color: 'bg-green-100 text-green-700',     dot: 'bg-green-500'  },
  viewing_scheduled: { label: 'موعد مشاهدة',   color: 'bg-yellow-100 text-yellow-700',   dot: 'bg-yellow-500' },
  negotiating:       { label: 'تفاوض',         color: 'bg-orange-100 text-orange-700',   dot: 'bg-orange-500' },
  contract_pending:  { label: 'عقد معلق',      color: 'bg-pink-100 text-pink-700',       dot: 'bg-pink-500'   },
  closed_won:        { label: 'اكتمل ✓',       color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500'},
  closed_lost:       { label: 'خسر',           color: 'bg-gray-100 text-gray-500',       dot: 'bg-gray-400'   },
  on_hold:           { label: 'معلق',          color: 'bg-slate-100 text-slate-600',     dot: 'bg-slate-400'  },
  follow_up:         { label: 'متابعة',        color: 'bg-cyan-100 text-cyan-700',       dot: 'bg-cyan-500'   },
};

const purposeLabels: Record<string, string> = {
  buy: 'شراء', rent: 'إيجار', invest: 'استثمار',
};

const sourceLabels: Record<string, string> = {
  manual: 'يدوي', whatsapp: 'واتساب', website: 'الموقع',
  referral: 'إحالة', social_media: 'سوشيال ميديا', excel_import: 'استيراد Excel',
};

// ─── Client Modal ─────────────────────────────────────────────────────────────
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

  const createMut = useMutation({
    mutationFn: (data: any) => clientsApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clients'] }); toast.success('تم إضافة العميل'); onClose(); },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'حدث خطأ'),
  });
  const updateMut = useMutation({
    mutationFn: (data: any) => clientsApi.update(client.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clients'] }); toast.success('تم حفظ التعديلات'); onClose(); },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'حدث خطأ'),
  });

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
    if (isEdit) updateMut.mutate(payload);
    else createMut.mutate(payload);
  };

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b z-10">
          <h3 className="text-lg font-bold text-gray-900">
            {isEdit ? 'تعديل العميل' : 'إضافة عميل جديد'}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <XMarkIcon className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">الاسم *</label>
            <input required className="input w-full" value={form.full_name}
              onChange={(e) => set('full_name', e.target.value)} placeholder="اسم العميل الكامل" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">رقم الجوال *</label>
              <input required className="input w-full" value={form.phone}
                onChange={(e) => set('phone', e.target.value)} placeholder="05xxxxxxxx" dir="ltr" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">البريد الإلكتروني</label>
              <input className="input w-full" type="email" value={form.email}
                onChange={(e) => set('email', e.target.value)} placeholder="example@email.com" dir="ltr" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">الميزانية (ريال)</label>
              <input className="input w-full" type="number" min="0" value={form.budget_max}
                onChange={(e) => set('budget_max', e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">الغرض</label>
              <select className="input w-full" value={form.purpose} onChange={(e) => set('purpose', e.target.value)}>
                {Object.entries(purposeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">الحالة</label>
              <select className="input w-full" value={form.status} onChange={(e) => set('status', e.target.value)}>
                {Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">المصدر</label>
              <select className="input w-full" value={form.source} onChange={(e) => set('source', e.target.value)}>
                {Object.entries(sourceLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">متطلبات خاصة</label>
            <input className="input w-full" value={form.special_requirements}
              onChange={(e) => set('special_requirements', e.target.value)}
              placeholder="مثال: قريب من المدرسة، 4 غرف" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">ملاحظات</label>
            <textarea className="input w-full resize-none" rows={3} value={form.notes}
              onChange={(e) => set('notes', e.target.value)} placeholder="أي معلومات إضافية..." />
          </div>
          <div className="flex gap-3 pt-2 border-t">
            <button type="submit" disabled={isPending} className="btn-primary flex-1 justify-center">
              {isPending ? 'جاري الحفظ...' : isEdit ? 'حفظ التعديلات' : 'إضافة العميل'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary px-6">إلغاء</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Matches Modal ────────────────────────────────────────────────────────────
function MatchesModal({ client, onClose }: { client: any; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['client-matches', client.id],
    queryFn: () => clientsApi.matches(client.id),
  });
  const properties = (data as any)?.data?.data ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h3 className="text-lg font-bold">عقارات مناسبة لـ {client.full_name ?? client.full_name_ar}</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {client.budget_max
                ? `الميزانية: ${client.budget_max?.toLocaleString('ar-SA')} ريال`
                : 'بدون تحديد ميزانية'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <XMarkIcon className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        <div className="p-5">
          {isLoading ? (
            <div className="space-y-3">
              {[1,2,3].map((i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
            </div>
          ) : properties.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <HomeIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="font-medium text-gray-600">لا توجد عقارات مناسبة حالياً</p>
              <p className="text-sm mt-1">تحقق من الميزانية والمتطلبات</p>
            </div>
          ) : (
            <div className="space-y-3">
              {properties.map((p: any) => (
                <div key={p.id} className="border border-gray-100 rounded-xl p-4 flex items-start justify-between gap-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                      <HomeIcon className="w-5 h-5 text-blue-500" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{p.title_ar ?? p.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {[p.city_name, p.address].filter(Boolean).join(' · ') || 'غير محدد'}
                        {p.area_sqm ? ` · ${p.area_sqm} م²` : ''}
                        {p.rooms ? ` · ${p.rooms} غرف` : ''}
                      </p>
                    </div>
                  </div>
                  {p.price > 0 && (
                    <div className="flex items-center gap-1 text-blue-700 font-bold whitespace-nowrap text-sm">
                      <CurrencyDollarIcon className="w-4 h-4" />
                      {Number(p.price).toLocaleString('ar-SA')}
                      <span className="text-xs font-normal text-gray-400">ر</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Client Row ───────────────────────────────────────────────────────────────
function ClientRow({ client, onEdit, onMatches }: { client: any; onEdit: () => void; onMatches: () => void }) {
  const sc = statusConfig[client.status] ?? { label: client.status, color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' };

  return (
    <tr className="hover:bg-gray-50/60 transition-colors group">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-100 to-blue-200 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-blue-700 text-sm">
            {(client.full_name ?? client.full_name_ar ?? '?').charAt(0)}
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm leading-tight">{client.full_name ?? client.full_name_ar}</p>
            <p className="text-[11px] text-gray-400">{sourceLabels[client.source] ?? client.source ?? '—'}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <a href={`tel:${client.phone}`}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-blue-600 transition-colors">
          <PhoneIcon className="w-3.5 h-3.5" />
          <span dir="ltr">{client.phone}</span>
        </a>
      </td>
      <td className="px-4 py-3 text-sm">
        {client.budget_max
          ? <span className="font-semibold text-gray-800">{Number(client.budget_max).toLocaleString('ar-SA')} <span className="text-xs font-normal text-gray-400">ر.س</span></span>
          : <span className="text-gray-400">—</span>}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {purposeLabels[client.purpose] ?? client.purpose ?? '—'}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${sc.color}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
          {sc.label}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-gray-400">
        {client.last_contact_at ? (
          <div title={format(new Date(client.last_contact_at), 'dd/MM/yyyy HH:mm', { locale: ar })}>
            <ClockIcon className="w-3.5 h-3.5 inline ml-1" />
            {formatDistanceToNow(new Date(client.last_contact_at), { locale: ar, addSuffix: true })}
          </div>
        ) : '—'}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit}
            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="تعديل">
            <PencilSquareIcon className="w-4 h-4" />
          </button>
          <button onClick={onMatches}
            className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors" title="عقارات مناسبة">
            <HomeIcon className="w-4 h-4" />
          </button>
          <button
            className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="المحادثة">
            <ChatBubbleLeftRightIcon className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ClientsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [purposeFilter, setPurposeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal]             = useState<{ open: boolean; client?: any }>({ open: false });
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

  const clients    = (data as any)?.data?.data ?? [];
  const pagination = (data as any)?.data?.pagination;

  const activeFilters = [statusFilter, purposeFilter].filter(Boolean).length;

  return (
    <div className="space-y-6">
      {modal.open && (
        <ClientModal client={modal.client} onClose={() => setModal({ open: false })} />
      )}
      {matchesClient && (
        <MatchesModal client={matchesClient} onClose={() => setMatchesClient(null)} />
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="page-title">إدارة العملاء</h2>
          <p className="page-sub mt-1">
            {pagination?.total != null ? `${pagination.total.toLocaleString('ar-SA')} عميل` : 'جاري التحميل...'}
          </p>
        </div>
        <button className="btn-primary" onClick={() => setModal({ open: true })}>
          <PlusIcon className="w-4 h-4" />
          إضافة عميل
        </button>
      </div>

      {/* Status pills */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => { setStatusFilter(''); setPage(1); }}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            !statusFilter ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}>
          الكل
          {pagination?.total ? <span className="mr-1 opacity-70">({pagination.total})</span> : ''}
        </button>
        {Object.entries(statusConfig).map(([k, v]) => (
          <button key={k} onClick={() => { setStatusFilter(k); setPage(1); }}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              statusFilter === k ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}>
            {v.label}
          </button>
        ))}
      </div>

      {/* Search + Filter bar */}
      <div className="card !p-4 space-y-3">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="بحث بالاسم أو رقم الجوال..."
              className="input pr-9 w-full" />
          </div>
          <button onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
              showFilters || activeFilters > 0
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>
            <FunnelIcon className="w-4 h-4" />
            فلترة
            {activeFilters > 0 && (
              <span className="bg-blue-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {activeFilters}
              </span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="flex gap-3 flex-wrap pt-2 border-t">
            <select value={purposeFilter}
              onChange={(e) => { setPurposeFilter(e.target.value); setPage(1); }}
              className="input w-auto min-w-36">
              <option value="">جميع الأغراض</option>
              {Object.entries(purposeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {activeFilters > 0 && (
              <button onClick={() => { setStatusFilter(''); setPurposeFilter(''); setPage(1); }}
                className="text-xs text-red-500 hover:text-red-700 underline px-2">
                مسح الفلاتر
              </button>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right">
            <thead className="bg-gray-50/80 border-b border-gray-100">
              <tr>
                {['العميل', 'الجوال', 'الميزانية', 'الغرض', 'الحالة', 'آخر تواصل', 'إجراء'].map((h) => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-200 rounded w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : clients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-16">
                    <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                      <UserIcon className="w-7 h-7 text-gray-400" />
                    </div>
                    <p className="font-semibold text-gray-700">لا يوجد عملاء</p>
                    <p className="text-sm text-gray-400 mt-1">
                      {search || activeFilters > 0 ? 'جرب تعديل الفلاتر' : 'ابدأ بإضافة أول عميل'}
                    </p>
                  </td>
                </tr>
              ) : (
                clients.map((client: any) => (
                  <ClientRow key={client.id} client={client}
                    onEdit={() => setModal({ open: true, client })}
                    onMatches={() => setMatchesClient(client)} />
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination && pagination.total_pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/50">
            <span className="text-sm text-gray-500">
              {(page - 1) * 15 + 1}–{Math.min(page * 15, pagination.total)} من {pagination.total.toLocaleString('ar-SA')} عميل
            </span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => p - 1)} disabled={page === 1}
                className="btn-secondary py-1.5 text-xs disabled:opacity-40">السابق</button>
              <button onClick={() => setPage((p) => p + 1)} disabled={page >= pagination.total_pages}
                className="btn-secondary py-1.5 text-xs disabled:opacity-40">التالي</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}