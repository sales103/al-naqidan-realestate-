import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { XMarkIcon, PlusIcon, CurrencyDollarIcon, UserIcon, HomeIcon } from '@heroicons/react/24/outline';
import { api, clientsApi, propertiesApi } from '../services/api.ts';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

const dealsApi = {
  list: (status?: string) => api.get('/deals', { params: status ? { status } : {} }),
  create: (data: any) => api.post('/deals', data),
  updateStatus: (id: string, status: string) => api.patch(`/deals/${id}/status`, { status }),
};

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  draft:             { label: 'مسودة',          color: 'text-gray-600',   bg: 'bg-gray-100' },
  pending_signature: { label: 'انتظار التوقيع', color: 'text-yellow-700', bg: 'bg-yellow-100' },
  signed:            { label: 'موقّع',           color: 'text-blue-700',   bg: 'bg-blue-100' },
  active:            { label: 'نشط',             color: 'text-purple-700', bg: 'bg-purple-100' },
  completed:         { label: 'مكتمل ✓',         color: 'text-emerald-700',bg: 'bg-emerald-100' },
  cancelled:         { label: 'ملغي',            color: 'text-red-600',    bg: 'bg-red-100' },
  disputed:          { label: 'متنازع عليه',     color: 'text-orange-700', bg: 'bg-orange-100' },
};

const nextStatuses: Record<string, string[]> = {
  draft:             ['pending_signature', 'cancelled'],
  pending_signature: ['signed', 'cancelled'],
  signed:            ['active', 'cancelled'],
  active:            ['completed', 'disputed', 'cancelled'],
  completed:         [],
  cancelled:         [],
  disputed:          ['active', 'cancelled'],
};

function NewDealModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    client_id: '', property_id: '', agreed_price: '',
    commission_percentage: '2.5', payment_method: 'cash', notes: '',
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const { data: clientsRes } = useQuery({ queryKey: ['clients-all'], queryFn: () => clientsApi.list({ limit: 100 }) });
  const { data: propsRes } = useQuery({ queryKey: ['properties-all'], queryFn: () => propertiesApi.search({ limit: 100 }) });

  const clients = (clientsRes as any)?.data?.data ?? [];
  const properties = (propsRes as any)?.data?.data ?? [];

  const mut = useMutation({
    mutationFn: (data: any) => dealsApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['deals'] }); onClose(); },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mut.mutate({
      client_id: form.client_id,
      property_id: form.property_id,
      agreed_price: parseFloat(form.agreed_price),
      commission_percentage: parseFloat(form.commission_percentage),
      payment_method: form.payment_method,
      notes: form.notes || undefined,
    });
  };

  const error = mut.error as any;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="text-lg font-bold">إنشاء صفقة جديدة</h3>
          <button onClick={onClose}><XMarkIcon className="w-5 h-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">العميل *</label>
            <select required className="input w-full" value={form.client_id} onChange={(e) => set('client_id', e.target.value)}>
              <option value="">اختر العميل...</option>
              {clients.map((c: any) => (
                <option key={c.id} value={c.id}>{c.full_name ?? c.full_name_ar} — {c.phone}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">العقار *</label>
            <select required className="input w-full" value={form.property_id} onChange={(e) => set('property_id', e.target.value)}>
              <option value="">اختر العقار...</option>
              {properties.map((p: any) => (
                <option key={p.id} value={p.id}>{p.title_ar ?? p.title} — {p.price?.toLocaleString('ar-SA')} ر</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">سعر الاتفاق (ريال) *</label>
              <input required type="number" className="input w-full" value={form.agreed_price} onChange={(e) => set('agreed_price', e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">نسبة العمولة %</label>
              <input type="number" step="0.1" className="input w-full" value={form.commission_percentage} onChange={(e) => set('commission_percentage', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">طريقة الدفع</label>
            <select className="input w-full" value={form.payment_method} onChange={(e) => set('payment_method', e.target.value)}>
              <option value="cash">نقداً</option>
              <option value="bank_transfer">تحويل بنكي</option>
              <option value="installment">أقساط</option>
              <option value="mortgage">تمويل عقاري</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات</label>
            <textarea className="input w-full" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="..." />
          </div>
          {error && <p className="text-red-500 text-sm">{error?.response?.data?.error ?? 'حدث خطأ'}</p>}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={mut.isPending} className="btn-primary flex-1 justify-center">
              {mut.isPending ? 'جارٍ الإنشاء...' : 'إنشاء الصفقة'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">إلغاء</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function DealsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [showNew, setShowNew] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['deals', statusFilter],
    queryFn: () => dealsApi.list(statusFilter || undefined),
  });

  const deals = (data as any)?.data?.data ?? [];

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => dealsApi.updateStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deals'] }),
  });

  const totalRevenue = deals
    .filter((d: any) => d.status === 'completed')
    .reduce((sum: number, d: any) => sum + (d.agreed_price ?? 0), 0);

  return (
    <div className="space-y-6">
      {showNew && <NewDealModal onClose={() => setShowNew(false)} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">الصفقات</h2>
          <p className="text-sm text-gray-500 mt-1">{deals.length} صفقة</p>
        </div>
        <button className="btn-primary" onClick={() => setShowNew(true)}>
          <PlusIcon className="w-5 h-5" />
          صفقة جديدة
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي الصفقات', value: deals.length, icon: '📋', color: 'text-blue-600' },
          { label: 'نشطة', value: deals.filter((d: any) => ['active','signed','pending_signature'].includes(d.status)).length, icon: '⚡', color: 'text-purple-600' },
          { label: 'مكتملة', value: deals.filter((d: any) => d.status === 'completed').length, icon: '✅', color: 'text-emerald-600' },
          { label: 'إجمالي الإيرادات', value: totalRevenue.toLocaleString('ar-SA') + ' ر', icon: '💰', color: 'text-amber-600' },
        ].map((s) => (
          <div key={s.label} className="card">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{s.icon}</span>
              <div>
                <p className="text-xs text-gray-500">{s.label}</p>
                <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[{ key: '', label: 'الكل' }, ...Object.entries(statusConfig).map(([k, v]) => ({ key: k, label: v.label }))].map((s) => (
          <button
            key={s.key}
            onClick={() => setStatusFilter(s.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              statusFilter === s.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Deals list */}
      <div className="space-y-3">
        {isLoading ? (
          [...Array(4)].map((_, i) => <div key={i} className="card h-24 animate-pulse bg-gray-50" />)
        ) : deals.length === 0 ? (
          <div className="card text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📋</p>
            <p>لا توجد صفقات</p>
          </div>
        ) : (
          deals.map((deal: any) => {
            const sc = statusConfig[deal.status] ?? statusConfig['draft']!;
            const commission = deal.commission_percentage
              ? ((deal.agreed_price ?? 0) * deal.commission_percentage / 100)
              : deal.commission_amount ?? 0;
            const nexts = nextStatuses[deal.status] ?? [];

            return (
              <div key={deal.id} className="card hover:shadow-md transition-shadow">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`badge ${sc.bg} ${sc.color}`}>{sc.label}</span>
                      {deal.deal_number && <span className="text-xs text-gray-400 font-mono">{deal.deal_number}</span>}
                    </div>
                    <div className="flex flex-wrap gap-4">
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <UserIcon className="w-4 h-4 text-gray-400" />
                        <span>{deal.client_name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <HomeIcon className="w-4 h-4 text-gray-400" />
                        <span className="truncate max-w-[200px]">{deal.property_title}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-4 mt-2">
                      <div className="flex items-center gap-1 font-bold text-blue-700">
                        <CurrencyDollarIcon className="w-4 h-4" />
                        <span>{(deal.agreed_price ?? 0).toLocaleString('ar-SA')}</span>
                        <span className="text-xs font-normal text-gray-400">ريال</span>
                      </div>
                      {commission > 0 && (
                        <div className="text-xs text-emerald-600">
                          عمولة: {commission.toLocaleString('ar-SA')} ر ({deal.commission_percentage}%)
                        </div>
                      )}
                      <div className="text-xs text-gray-400">
                        {deal.created_at ? format(new Date(deal.created_at), 'dd MMM yyyy', { locale: ar }) : ''}
                      </div>
                    </div>
                  </div>

                  {/* Status actions */}
                  {nexts.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {nexts.map((next) => {
                        const ns = statusConfig[next]!;
                        return (
                          <button
                            key={next}
                            onClick={() => updateStatus.mutate({ id: deal.id, status: next })}
                            disabled={updateStatus.isPending}
                            className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${ns.bg} ${ns.color} border-current/20 hover:opacity-80 disabled:opacity-40`}
                          >
                            → {ns.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
