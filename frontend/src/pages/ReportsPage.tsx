import { useQuery } from '@tanstack/react-query';
import {
  BuildingOfficeIcon, UsersIcon, ChatBubbleLeftRightIcon,
  ArrowTrendingUpIcon, ChartBarIcon, MapPinIcon,
  ArrowUpIcon, ArrowDownIcon,
} from '@heroicons/react/24/outline';
import { dashboardApi } from '../services/api.ts';

// ─── Types ────────────────────────────────────────────────────────────────────
const propertyTypeAr: Record<string, string> = {
  land: 'أراضي', apartment: 'شقق', villa: 'فلل', building: 'عمائر',
  office: 'مكاتب', showroom: 'معارض', warehouse: 'مستودعات',
  farm: 'مزارع', investment_project: 'مشاريع', other: 'أخرى',
};

const clientStatusAr: Record<string, { label: string; color: string }> = {
  new:               { label: 'جديد',       color: '#3B82F6' },
  contacted:         { label: 'تواصل',       color: '#8B5CF6' },
  interested:        { label: 'مهتم',        color: '#10B981' },
  viewing_scheduled: { label: 'موعد',        color: '#F59E0B' },
  negotiating:       { label: 'تفاوض',       color: '#F97316' },
  contract_pending:  { label: 'عقد',         color: '#EC4899' },
  closed_won:        { label: 'اكتمل',       color: '#059669' },
  closed_lost:       { label: 'خسر',         color: '#9CA3AF' },
  on_hold:           { label: 'معلق',        color: '#6B7280' },
  follow_up:         { label: 'متابعة',      color: '#06B6D4' },
};

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, iconBg, trend }: {
  icon: React.ElementType; label: string; value: string | number;
  sub?: string; iconBg: string; trend?: { value: number; label: string };
}) {
  return (
    <div className="card flex items-start gap-4">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-500 font-medium">{label}</p>
        <p className="text-3xl font-bold text-gray-900 mt-0.5 leading-tight">
          {typeof value === 'number' ? value.toLocaleString('ar-SA') : value}
        </p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        {trend && (
          <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${trend.value >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {trend.value >= 0
              ? <ArrowUpIcon className="w-3 h-3" />
              : <ArrowDownIcon className="w-3 h-3" />}
            {Math.abs(trend.value)} {trend.label}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Horizontal Bar Chart ─────────────────────────────────────────────────────
function HBarChart({ data, color = '#3B82F6' }: {
  data: { label: string; value: number; color?: string }[];
  color?: string;
}) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="space-y-2.5">
      {data.map((item) => (
        <div key={item.label}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-gray-700 font-medium">{item.label}</span>
            <span className="text-sm font-bold text-gray-900">{item.value.toLocaleString('ar-SA')}</span>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${(item.value / max) * 100}%`,
                backgroundColor: item.color ?? color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Donut Stat (simple) ──────────────────────────────────────────────────────
function DonutStat({ percent, label, color }: { percent: number; label: string; color: string }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = (percent / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 88 88" className="w-full h-full -rotate-90">
          <circle cx="44" cy="44" r={r} fill="none" stroke="#F3F4F6" strokeWidth="10" />
          <circle cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="10"
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-bold text-gray-900">{Math.round(percent)}%</span>
        </div>
      </div>
      <span className="text-xs text-gray-500 font-medium text-center leading-tight">{label}</span>
    </div>
  );
}

// ─── Message Sparkline ────────────────────────────────────────────────────────
function MessageChart({ data }: { data: { date: string; count: number }[] }) {
  if (!data.length) return (
    <div className="h-24 flex items-center justify-center text-gray-400 text-sm">لا توجد بيانات</div>
  );
  const max = Math.max(...data.map(d => Number(d.count)), 1);
  const days = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

  return (
    <div className="flex items-end gap-1.5 h-28">
      {data.map((d, i) => {
        const pct = (Number(d.count) / max) * 100;
        const date = new Date(d.date);
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
            <div className="relative flex-1 w-full flex items-end">
              <div
                className="w-full bg-blue-500 rounded-t-md transition-all duration-500 group-hover:bg-blue-600"
                style={{ height: `${Math.max(pct, 4)}%` }}
              />
              <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                {Number(d.count).toLocaleString('ar-SA')} رسالة
              </div>
            </div>
            <span className="text-[9px] text-gray-400">{days[date.getDay()]?.slice(0,3)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const { data: statsRes, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: dashboardApi.stats,
  });
  const stats = (statsRes as any)?.data?.data;

  const propTotal    = stats?.properties?.total     ?? 0;
  const propAvail    = stats?.properties?.available  ?? 0;
  const propReserved = stats?.properties?.reserved   ?? 0;
  const propSold     = stats?.properties?.sold       ?? 0;
  const clientTotal  = stats?.clients?.total         ?? 0;
  const closedWon    = stats?.clients?.closed_won    ?? 0;
  const newToday     = stats?.clients?.new_today      ?? 0;
  const newWeek      = stats?.clients?.new_this_week  ?? 0;
  const convRate     = stats?.analytics?.conversion_rate ?? 0;
  const topProps     = stats?.analytics?.top_properties  ?? [];
  const msgChart     = stats?.analytics?.message_chart   ?? [];
  const msgsToday    = stats?.conversations?.total_messages_today ?? 0;

  // Build chart data
  const byType = Object.entries(stats?.properties?.by_type ?? {})
    .map(([k, v]) => ({ label: propertyTypeAr[k] ?? k, value: Number(v) }))
    .sort((a, b) => b.value - a.value);

  const byStatus = Object.entries(stats?.clients?.by_status ?? {})
    .map(([k, v]) => ({ label: clientStatusAr[k]?.label ?? k, value: Number(v), color: clientStatusAr[k]?.color }))
    .sort((a, b) => b.value - a.value);

  const availPct   = propTotal > 0 ? (propAvail / propTotal) * 100 : 0;
  const soldPct    = propTotal > 0 ? (propSold  / propTotal) * 100 : 0;
  const convPct    = clientTotal > 0 ? (closedWon / clientTotal) * 100 : 0;

  if (isLoading) return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => (
          <div key={i} className="card animate-pulse h-28">
            <div className="flex gap-4">
              <div className="w-12 h-12 bg-gray-200 rounded-2xl" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-3 bg-gray-200 rounded w-2/3" />
                <div className="h-7 bg-gray-200 rounded w-1/2" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="page-title">التقارير والإحصائيات</h2>
        <p className="page-sub mt-1">نظرة شاملة على أداء الشركة</p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={BuildingOfficeIcon} iconBg="bg-blue-600"
          label="إجمالي العقارات" value={propTotal}
          sub={`${propAvail} متاح · ${propReserved} محجوز · ${propSold} مباع`}
        />
        <KpiCard
          icon={UsersIcon} iconBg="bg-purple-600"
          label="إجمالي العملاء" value={clientTotal}
          sub={`${closedWon} صفقة مكتملة`}
          trend={{ value: newToday, label: 'عميل اليوم' }}
        />
        <KpiCard
          icon={ArrowTrendingUpIcon} iconBg="bg-emerald-600"
          label="معدل التحويل" value={`${convRate}%`}
          sub={`${newWeek} عميل هذا الأسبوع`}
        />
        <KpiCard
          icon={ChatBubbleLeftRightIcon} iconBg="bg-orange-500"
          label="رسائل اليوم" value={msgsToday}
          sub="واتساب والمحادثات"
        />
      </div>

      {/* Row 2: Property chart + Client chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Property by type */}
        <div className="card">
          <h3 className="font-bold text-gray-900 mb-5 flex items-center gap-2">
            <ChartBarIcon className="w-5 h-5 text-blue-600" />
            توزيع العقارات حسب النوع
          </h3>
          {byType.length > 0 ? (
            <HBarChart data={byType} color="#3B82F6" />
          ) : (
            <p className="text-gray-400 text-sm text-center py-8">لا توجد بيانات</p>
          )}
        </div>

        {/* Clients by status */}
        <div className="card">
          <h3 className="font-bold text-gray-900 mb-5 flex items-center gap-2">
            <ChartBarIcon className="w-5 h-5 text-purple-600" />
            توزيع العملاء حسب الحالة
          </h3>
          {byStatus.length > 0 ? (
            <HBarChart data={byStatus} />
          ) : (
            <p className="text-gray-400 text-sm text-center py-8">لا توجد بيانات</p>
          )}
        </div>
      </div>

      {/* Row 3: Ratios + Message chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Donut ratios */}
        <div className="card">
          <h3 className="font-bold text-gray-900 mb-6">نسب الأداء</h3>
          <div className="flex items-center justify-around">
            <DonutStat percent={availPct}  label="عقارات متاحة"   color="#10B981" />
            <DonutStat percent={soldPct}   label="عقارات مباعة"   color="#3B82F6" />
            <DonutStat percent={convPct}   label="تحويل العملاء"  color="#8B5CF6" />
          </div>
        </div>

        {/* Message activity */}
        <div className="card lg:col-span-2">
          <h3 className="font-bold text-gray-900 mb-4">نشاط الرسائل (آخر 7 أيام)</h3>
          <MessageChart data={msgChart} />
          {msgChart.length > 0 && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50 text-xs text-gray-500">
              <span>إجمالي: <strong className="text-gray-800">{msgChart.reduce((s: number, d: any) => s + Number(d.count), 0).toLocaleString('ar-SA')}</strong> رسالة</span>
              <span>أعلى يوم: <strong className="text-gray-800">{Math.max(...msgChart.map((d: any) => Number(d.count)), 0).toLocaleString('ar-SA')}</strong></span>
            </div>
          )}
        </div>
      </div>

      {/* Row 4: Top properties */}
      {topProps.length > 0 && (
        <div className="card">
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <BuildingOfficeIcon className="w-5 h-5 text-amber-500" />
            أكثر العقارات استفساراً
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-right">
              <thead>
                <tr className="border-b border-gray-100">
                  {['العقار', 'المدينة', 'الاستفسارات', 'المشاهدات'].map(h => (
                    <th key={h} className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {topProps.map((p: any, i: number) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${
                          i === 0 ? 'bg-amber-400' : i === 1 ? 'bg-gray-400' : i === 2 ? 'bg-orange-400' : 'bg-gray-200 text-gray-600'
                        }`}>{i + 1}</span>
                        <span className="font-medium text-gray-900 text-sm truncate max-w-[200px]">{p.title_ar}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <MapPinIcon className="w-3.5 h-3.5 text-gray-400" />
                        {p.city ?? '—'}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full"
                            style={{ width: `${Math.min((p.inquiry_count / (topProps[0]?.inquiry_count || 1)) * 100, 100)}%` }} />
                        </div>
                        <span className="text-sm font-semibold text-blue-700">{p.inquiry_count ?? 0}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-600 font-medium">{p.view_count ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Summary footer */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'عقارات متاحة الآن',  value: propAvail,  color: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' },
          { label: 'عملاء جدد هذا الأسبوع', value: newWeek,  color: 'bg-blue-50 border-blue-200',     text: 'text-blue-700'    },
          { label: 'عملاء في التفاوض',    value: stats?.clients?.by_status?.negotiating ?? 0, color: 'bg-orange-50 border-orange-200', text: 'text-orange-700' },
        ].map(item => (
          <div key={item.label} className={`rounded-2xl border p-5 ${item.color}`}>
            <p className={`text-3xl font-bold ${item.text}`}>{item.value.toLocaleString('ar-SA')}</p>
            <p className="text-sm text-gray-600 mt-1">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}