import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ClipboardDocumentListIcon, ShieldCheckIcon,
  ChevronRightIcon, ChevronLeftIcon, FunnelIcon,
} from '@heroicons/react/24/outline';
import { auditApi } from '../services/api.ts';
import { useAuthStore } from '../store/auth.store.ts';

/* ── Action config (Arabic labels + colored badges) ─────────────────────── */
const actionConfig: Record<string, { label: string; bg: string; color: string; borderColor: string }> = {
  'user.create':           { label: 'إنشاء موظف',           bg: 'rgba(5,150,105,0.08)',   color: '#059669', borderColor: 'rgba(5,150,105,0.18)' },
  'user.update':           { label: 'تعديل موظف',           bg: 'rgba(59,91,219,0.08)',   color: '#3B5BDB', borderColor: 'rgba(59,91,219,0.18)' },
  'user.delete':           { label: 'تعطيل موظف',           bg: 'rgba(239,68,68,0.08)',   color: '#DC2626', borderColor: 'rgba(239,68,68,0.2)' },
  'user.invite_resend':    { label: 'إعادة إرسال دعوة',     bg: 'rgba(245,158,11,0.08)',  color: '#D97706', borderColor: 'rgba(245,158,11,0.18)' },
  'auth.login':            { label: 'تسجيل دخول',           bg: 'rgba(100,116,139,0.08)', color: '#64748B', borderColor: 'rgba(100,116,139,0.15)' },
  'auth.password_change':  { label: 'تغيير كلمة مرور',      bg: 'rgba(124,58,237,0.08)',  color: '#7C3AED', borderColor: 'rgba(124,58,237,0.2)' },
  'auth.password_reset':   { label: 'استعادة كلمة مرور',    bg: 'rgba(124,58,237,0.08)',  color: '#7C3AED', borderColor: 'rgba(124,58,237,0.2)' },
  'auth.profile_update':   { label: 'تعديل الملف الشخصي',   bg: 'rgba(59,91,219,0.08)',   color: '#3B5BDB', borderColor: 'rgba(59,91,219,0.18)' },
  'auth.account_activated':{ label: 'تفعيل حساب',           bg: 'rgba(5,150,105,0.08)',   color: '#059669', borderColor: 'rgba(5,150,105,0.18)' },
  'settings.update':       { label: 'تعديل إعدادات',        bg: 'rgba(245,158,11,0.08)',  color: '#D97706', borderColor: 'rgba(245,158,11,0.18)' },
  'conversation.delete':   { label: 'حذف محادثة',           bg: 'rgba(239,68,68,0.08)',   color: '#DC2626', borderColor: 'rgba(239,68,68,0.2)' },
};

/* Arabic labels for detail field names */
const fieldLabels: Record<string, string> = {
  full_name: 'الاسم', full_name_ar: 'الاسم بالعربية', email: 'البريد',
  role: 'الدور', whatsapp_instance: 'رقم الواتساب', is_active: 'الحالة',
  phone: 'الجوال', avatar_url: 'الصورة الشخصية', key: 'القسم',
  wa_instance: 'رقم الواتساب', password_changed: 'تم تغيير كلمة المرور',
};

/** Compact Arabic summary of the details JSON. */
function detailsSummary(action: string, details: any): string {
  if (!details || typeof details !== 'object') return '—';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(details)) {
    if (v === null || v === undefined) continue;
    const label = fieldLabels[k] ?? k;
    if (k === 'password_changed') { parts.push(label); continue; }
    if (k === 'fields' && Array.isArray(v)) {
      parts.push(`الحقول: ${v.map((f) => fieldLabels[f] ?? f).join('، ')}`);
      continue;
    }
    if (typeof v === 'object' && v !== null && 'from' in (v as any) && 'to' in (v as any)) {
      const o = v as any;
      parts.push(`${label}: ${String(o.from ?? '—')} ← ${String(o.to ?? '—')}`);
      continue;
    }
    parts.push(`${label}: ${String(v)}`);
  }
  return parts.length ? parts.join(' • ') : '—';
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ar-SA', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

/* ── Main ────────────────────────────────────────────────────────────────── */
export default function AuditLogPage() {
  const user = useAuthStore(s => s.user);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const limit = 50;

  const { data: res, isLoading } = useQuery({
    queryKey: ['audit', page, actionFilter],
    queryFn: () => auditApi.list({ page, limit, ...(actionFilter ? { action: actionFilter } : {}) }),
    enabled: ['super_admin', 'admin'].includes(user?.role ?? ''),
  });

  if (!['super_admin', 'admin'].includes(user?.role ?? '')) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
            <ShieldCheckIcon className="w-8 h-8" style={{ color: '#EF4444' }} />
          </div>
          <p className="font-bold" style={{ color: '#0F1C35' }}>هذه الصفحة للمدير فقط</p>
          <p className="text-sm mt-1" style={{ color: '#7A8FAA' }}>لا تملك صلاحية الوصول إلى سجل النشاطات</p>
        </div>
      </div>
    );
  }

  const rows: any[] = (res as any)?.data?.data ?? [];
  const pagination = (res as any)?.data?.pagination ?? { page: 1, pages: 1, total: 0 };
  const totalPages = Math.max(1, Number(pagination.pages) || 1);

  return (
    <div className="space-y-6">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="page-title">سجل النشاطات</h2>
          <p className="page-sub">من فعل ماذا ومتى — تتبع العمليات الحساسة في النظام</p>
        </div>
        <div className="flex items-center gap-2">
          <FunnelIcon className="w-4 h-4" style={{ color: '#7A8FAA' }} />
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            className="input text-sm"
            style={{ minWidth: '190px' }}>
            <option value="">كل الإجراءات</option>
            {Object.entries(actionConfig).map(([value, cfg]) => (
              <option key={value} value={value}>{cfg.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-3 animate-pulse">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-2xl h-14" style={{ background: 'rgba(59,91,219,0.04)', border: '1px solid rgba(59,91,219,0.06)' }} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl py-20 text-center" style={{ background: '#fff', border: '1px solid rgba(59,91,219,0.08)' }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(59,91,219,0.06)' }}>
            <ClipboardDocumentListIcon className="w-8 h-8" style={{ color: '#C4CEDE' }} />
          </div>
          <p className="font-bold" style={{ color: '#0F1C35' }}>لا توجد نشاطات مسجلة</p>
          <p className="text-sm mt-1" style={{ color: '#7A8FAA' }}>ستظهر هنا العمليات الحساسة فور تنفيذها</p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid rgba(59,91,219,0.08)', boxShadow: '0 1px 4px rgba(6,12,24,0.05)' }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: '720px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(59,91,219,0.06)', background: 'rgba(242,246,255,0.6)' }}>
                  {['الموظف', 'الإجراء', 'التفاصيل', 'IP', 'التاريخ والوقت'].map((h, i) => (
                    <th key={i} className="px-5 py-3.5 text-right text-xs font-bold tracking-wide" style={{ color: '#7A8FAA' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const cfg = actionConfig[r.action] ?? { label: r.action, bg: 'rgba(100,116,139,0.08)', color: '#64748B', borderColor: 'rgba(100,116,139,0.15)' };
                  const isLast = idx === rows.length - 1;
                  return (
                    <tr key={r.id} style={{ borderBottom: isLast ? 'none' : '1px solid rgba(59,91,219,0.05)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,91,219,0.025)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td className="px-5 py-4 font-semibold whitespace-nowrap" style={{ color: '#0F1C35' }}>
                        {r.user_name ?? <span style={{ color: '#C4CEDE' }}>النظام</span>}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
                          style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.borderColor}` }}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-4" style={{ color: '#5A6882', maxWidth: '340px' }}>
                        <span className="block truncate" title={detailsSummary(r.action, r.details)}>
                          {detailsSummary(r.action, r.details)}
                        </span>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap" dir="ltr" style={{ color: '#7A8FAA', textAlign: 'right' }}>
                        {r.ip ?? '—'}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-xs" style={{ color: '#7A8FAA' }}>
                        {formatDate(r.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Pagination ────────────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-5 py-3.5" style={{ borderTop: '1px solid rgba(59,91,219,0.06)', background: 'rgba(242,246,255,0.4)' }}>
            <p className="text-xs" style={{ color: '#7A8FAA' }}>
              صفحة {page} من {totalPages} — الإجمالي {Number(pagination.total) || 0} نشاط
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: '#fff', border: '1px solid rgba(59,91,219,0.15)', color: '#3B5BDB' }}>
                <ChevronRightIcon className="w-3.5 h-3.5" />
                سابق
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: '#fff', border: '1px solid rgba(59,91,219,0.15)', color: '#3B5BDB' }}>
                التالي
                <ChevronLeftIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
