import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UserIcon, PhoneIcon, MagnifyingGlassIcon,
  ChatBubbleLeftRightIcon, PencilSquareIcon, PlusIcon, XMarkIcon,
} from '@heroicons/react/24/outline';
import { clientsApi } from '../services/api.ts';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

const statusConfig: Record<string, { label: string; color: string }> = {
  new: { label: 'جديد', color: 'bg-blue-100 text-blue-700' },
  contacted: { label: 'تواصل', color: 'bg-purple-100 text-purple-700' },
  interested: { label: 'مهتم', color: 'bg-green-100 text-green-700' },
  viewing_scheduled: { label: 'موعد مشاهدة', color: 'bg-yellow-100 text-yellow-700' },
  negotiating: { label: 'تفاوض', color: 'bg-orange-100 text-orange-700' },
  contract_pending: { label: 'عقد معلق', color: 'bg-pink-100 text-pink-700' },
  closed_won: { label: 'اكتمل ✓', color: 'bg-emerald-100 text-emerald-700' },
  closed_lost: { label: 'خسر', color: 'bg-gray-100 text-gray-500' },
  on_hold: { label: 'معلق', color: 'bg-slate-100 text-slate-600' },
  follow_up: { label: 'متابعة', color: 'bg-cyan-100 text-cyan-700' },
};

function ClientModal({ client, onClose }: { client?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!client;
  const [form, setForm] = useState({
    full_name: client?.full_name ?? client?.full_name_ar ?? '',
    phone: client?.phone ?? '',
    email: client?.email ?? '',
    budget_max: client?.budget_max ?? '',
    purpose: client?.purpose ?? 'buy',
    status: client?.status ?? 'new',
    source: client?.source ?? 'manual',
    special_requirements: client?.special_requirements ?? '',
    notes: client?.ai_summary ?? '',
  });

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const createMut = useMutation({
    mutationFn: (data: any) => clientsApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clients'] }); onClose(); },
  });
  const updateMut = useMutation({
    mutationFn: (data: any) => clientsApi.update(client.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clients'] }); onClose(); },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      full_name: form.full_name,
      phone: form.phone,
      email: form.email || undefined,
      budget_max: form.budget_max ? parseFloat(String(form.budget_max)) : undefined,
      purpose: form.purpose,
      status: form.status,
      source: form.source,
      special_requirements: form.special_requirements || undefined,
      notes: form.notes || undefined,
    };
    if (isEdit) updateMut.mutate(payload);
    else createMut.mutate(payload);
  };

  const isPending = createMut.isPending || updateMut.isPending;
  const error = (createMut.error || updateMut.error) as any;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="text-lg font-bold">{isEdit ? 'تعديل العميل' : 'إضافة عميل جديد'}</h3>
          <button onClick={onClose}><XMarkIcon className="w-5 h-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">الاسم *</label>
            <input required className="input w-full" value={form.full_name} onChange={(e) => set('full_name', e.target.value)} placeholder="اسم العميل" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">رقم الجوال *</label>
              <input required className="input w-full" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="05xxxxxxxx" dir="ltr" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">البريد الإلكتروني</label>
              <input className="input w-full" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="example@email.com" dir="ltr" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الميزانية (ريال)</label>
              <input className="input w-full" type="number" value={form.budget_max} onChange={(e) => set('budget_max', e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الغرض</label>
              <select className="input w-full" value={form.purpose} onChange={(e) => set('purpose', e.target.value)}>
                <option value="buy">شراء</option>
                <option value="rent">إيجار</option>
                <option value="invest">استثمار</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الحالة</label>
              <select className="input w-full" value={form.status} onChange={(e) => set('status', e.target.value)}>
                {Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">المصدر</label>
              <select className="input w-full" value={form.source} onChange={(e) => set('source', e.target.value)}>
                <option value="manual">يدوي</option>
                <option value="whatsapp">واتساب</option>
                <option value="website">الموقع</option>
                <option value="referral">إحالة</option>
                <option value="social_media">سوشيال ميديا</option>
                <option value="excel_import">استيراد Excel</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">متطلبات خاصة</label>
            <input className="input w-full" value={form.special_requirements} onChange={(e) => set('special_requirements', e.target.value)} placeholder="مثال: قريب من المدرسة، 4 غرف" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات</label>
            <textarea className="input w-full" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="أي معلومات إضافية..." />
          </div>
          {error && <p className="text-red-500 text-sm">{error?.response?.data?.error ?? 'حدث خطأ'}</p>}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={isPending} className="btn-primary flex-1 justify-center">
              {isPending ? 'جارٍ الحفظ...' : isEdit ? 'حفظ التعديلات' : 'إضافة العميل'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">إلغاء</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ClientsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<{ open: boolean; client?: any }>({ open: false });

  const { data, isLoading } = useQuery({
    queryKey: ['clients', statusFilter, search, page],
    queryFn: () => clientsApi.list({ status: statusFilter || undefined, search: search || undefined, page, limit: 15 }),
  });

  const clients = (data as any)?.data?.data ?? [];
  const pagination = (data as any)?.data?.pagination;

  return (
    <div className="space-y-6">
      {modal.open && (
        <ClientModal client={modal.client} onClose={() => setModal({ open: false })} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">إدارة العملاء</h2>
          <p className="text-sm text-gray-500 mt-1">{pagination?.total ?? 0} عميل</p>
        </div>
        <button className="btn-primary" onClick={() => setModal({ open: true })}>
          <PlusIcon className="w-5 h-5" />
          إضافة عميل
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[{ key: '', label: 'الكل' }, ...Object.entries(statusConfig).map(([k, v]) => ({ key: k, label: v.label }))].map((s) => (
          <button
            key={s.key}
            onClick={() => { setStatusFilter(s.key); setPage(1); }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              statusFilter === s.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="card !p-4">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="بحث بالاسم أو رقم الجوال..."
            className="input pr-9"
          />
        </div>
      </div>

      {/* Table */}
      <div className="card !p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="table-header">العميل</th>
                <th className="table-header">الجوال</th>
                <th className="table-header">الميزانية</th>
                <th className="table-header">الغرض</th>
                <th className="table-header">الحالة</th>
                <th className="table-header">آخر تواصل</th>
                <th className="table-header">الإجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading
                ? [...Array(5)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {[...Array(7)].map((_, j) => (
                        <td key={j} className="table-cell"><div className="h-4 bg-gray-200 rounded w-3/4" /></td>
                      ))}
                    </tr>
                  ))
                : clients.length === 0
                ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-400">
                      <UserIcon className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                      لا يوجد عملاء
                    </td>
                  </tr>
                )
                : clients.map((client: any) => {
                    const sc = statusConfig[client.status] ?? { label: client.status, color: 'bg-gray-100 text-gray-600' };
                    const purposeMap: Record<string, string> = { buy: 'شراء', rent: 'إيجار', invest: 'استثمار' };
                    return (
                      <tr key={client.id} className="hover:bg-gray-50 transition-colors">
                        <td className="table-cell">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                              <span className="text-sm font-bold text-blue-700">
                                {(client.full_name ?? client.full_name_ar ?? '?').charAt(0)}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{client.full_name ?? client.full_name_ar}</p>
                              <p className="text-xs text-gray-400">{client.source ?? '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="table-cell">
                          <a href={`tel:${client.phone}`} className="flex items-center gap-1 text-gray-600 hover:text-blue-600">
                            <PhoneIcon className="w-3.5 h-3.5" />
                            {client.phone}
                          </a>
                        </td>
                        <td className="table-cell">
                          {client.budget_max
                            ? <span className="font-medium">{client.budget_max.toLocaleString('ar-SA')} ر</span>
                            : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="table-cell text-gray-600 text-sm">
                          {purposeMap[client.purpose] ?? client.purpose ?? '—'}
                        </td>
                        <td className="table-cell">
                          <span className={`badge ${sc.color}`}>{sc.label}</span>
                        </td>
                        <td className="table-cell text-gray-500 text-xs">
                          {client.last_contact_at
                            ? format(new Date(client.last_contact_at), 'dd/MM HH:mm', { locale: ar })
                            : '—'}
                        </td>
                        <td className="table-cell">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setModal({ open: true, client })}
                              className="text-blue-600 hover:text-blue-700 p-1 rounded hover:bg-blue-50"
                              title="تعديل"
                            >
                              <PencilSquareIcon className="w-4 h-4" />
                            </button>
                            <button
                              className="text-green-600 hover:text-green-700 p-1 rounded hover:bg-green-50"
                              title="المحادثة"
                            >
                              <ChatBubbleLeftRightIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>

        {pagination && pagination.total_pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-sm text-gray-500">
              عرض {(page - 1) * 15 + 1}–{Math.min(page * 15, pagination.total)} من {pagination.total}
            </span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => p - 1)} disabled={page === 1} className="btn-secondary py-1 text-xs disabled:opacity-40">السابق</button>
              <button onClick={() => setPage((p) => p + 1)} disabled={page >= pagination.total_pages} className="btn-secondary py-1 text-xs disabled:opacity-40">التالي</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
