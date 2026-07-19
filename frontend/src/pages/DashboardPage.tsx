import { useQuery } from '@tanstack/react-query';
import {
  BuildingOfficeIcon, UsersIcon, ChatBubbleLeftRightIcon,
  CurrencyDollarIcon, ArrowTrendingUpIcon, ArrowTrendingDownIcon,
  PhoneIcon, SparklesIcon, CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { Line, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Title, Tooltip, Legend, ArcElement, Filler,
} from 'chart.js';
import { dashboardApi } from '../services/api.ts';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement, Filler);

const clientStatusLabels: Record<string, string> = {
  new:               'جديد',
  contacted:         'تم التواصل',
  interested:        'مهتم',
  viewing_scheduled: 'موعد مشاهدة',
  negotiating:       'تفاوض',
  contract_pending:  'عقد معلق',
  closed_won:        'اكتمل',
  closed_lost:       'خسر',
};

const statusColors: Record<string, string> = {
  new:               '#3B82F6',
  contacted:         '#8B5CF6',
  interested:        '#10B981',
  viewing_scheduled: '#F59E0B',
  negotiating:       '#EF4444',
  contract_pending:  '#EC4899',
  closed_won:        '#059669',
  closed_lost:       '#6B7280',
};

const clientBadge: Record<string, string> = {
  new:               'bg-blue-100 text-blue-700',
  contacted:         'bg-purple-100 text-purple-700',
  interested:        'bg-green-100 text-green-700',
  viewing_scheduled: 'bg-amber-100 text-amber-700',
  negotiating:       'bg-red-100 text-red-700',
  closed_won:        'bg-emerald-100 text-emerald-700',
  closed_lost:       'bg-gray-100 text-gray-500',
};

export default function DashboardPage() {
  const { data: statsRes, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => dashboardApi.stats(),
    refetchInterval: 30000,
  });

  const { data: activityRes } = useQuery({
    queryKey: ['dashboard-activity'],
    queryFn: () => dashboardApi.activity(),
  });

  const stats   = (statsRes as any)?.data?.data;
  const activity = (activityRes as any)?.data?.data;

  if (isLoading) return <DashboardSkeleton />;

  const messageChartData = {
    labels: stats?.analytics?.message_chart?.map((d: any) =>
      format(new Date(d.date), 'dd/MM', { locale: ar })
    ) ?? [],
    datasets: [{
      label: 'الرسائل',
      data: stats?.analytics?.message_chart?.map((d: any) => d.count) ?? [],
      borderColor: '#3B82F6',
      backgroundColor: 'rgba(59,130,246,0.08)',
      fill: true,
      tension: 0.4,
      pointRadius: 3,
      pointBackgroundColor: '#3B82F6',
      borderWidth: 2,
    }],
  };

  const clientStatusData = {
    labels: Object.entries(stats?.clients?.by_status ?? {}).map(([k]) => clientStatusLabels[k] ?? k),
    datasets: [{
      data: Object.values(stats?.clients?.by_status ?? {}),
      backgroundColor: Object.keys(stats?.clients?.by_status ?? {}).map(k => statusColors[k] ?? '#94A3B8'),
      borderWidth: 0,
      hoverOffset: 4,
    }],
  };

  const totalRevM = ((stats?.deals?.total_revenue ?? 0) / 1_000_000).toFixed(1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">لوحة التحكم</h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {format(new Date(), 'EEEE، d MMMM yyyy', { locale: ar })}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-full">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
          النظام يعمل بكفاءة
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="عقارات متاحة"
          value={stats?.properties?.available ?? 0}
          sub={`من إجمالي ${stats?.properties?.total ?? 0}`}
          icon={BuildingOfficeIcon}
          gradient="from-blue-500 to-blue-600"
          bg="bg-blue-50"
          iconColor="text-blue-600"
          trend={+2}
        />
        <StatCard
          label="عملاء اليوم"
          value={stats?.clients?.new_today ?? 0}
          sub={`${stats?.clients?.total ?? 0} إجمالي`}
          icon={UsersIcon}
          gradient="from-violet-500 to-violet-600"
          bg="bg-violet-50"
          iconColor="text-violet-600"
          trend={stats?.clients?.new_today > 0 ? +1 : 0}
        />
        <StatCard
          label="رسائل اليوم"
          value={stats?.conversations?.total_messages_today ?? 0}
          sub={`${stats?.conversations?.ai_responses_today ?? 0} ردود AI`}
          icon={ChatBubbleLeftRightIcon}
          gradient="from-emerald-500 to-emerald-600"
          bg="bg-emerald-50"
          iconColor="text-emerald-600"
          trend={+1}
        />
        <StatCard
          label="إجمالي المبيعات"
          value={`${totalRevM}م`}
          sub={`${stats?.deals?.completed ?? 0} صفقة مكتملة`}
          icon={CurrencyDollarIcon}
          gradient="from-amber-500 to-orange-500"
          bg="bg-amber-50"
          iconColor="text-amber-600"
          trend={0}
          valueClass="text-2xl"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Messages Chart */}
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-semibold text-gray-900">نشاط الرسائل</h3>
              <p className="text-xs text-gray-400 mt-0.5">آخر 7 أيام</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
              <SparklesIcon className="w-3.5 h-3.5" />
              مدعوم بالذكاء الاصطناعي
            </div>
          </div>
          <Line data={messageChartData} options={{
            responsive: true,
            plugins: { legend: { display: false }, tooltip: { rtl: true, bodyFont: { family: 'IBM Plex Sans Arabic' } } },
            scales: {
              y: { beginAtZero: true, grid: { color: '#F8FAFC' }, border: { display: false }, ticks: { color: '#94a3b8', font: { size: 11 } } },
              x: { grid: { display: false }, border: { display: false }, ticks: { color: '#94a3b8', font: { size: 11 } } },
            },
          }} />
        </div>

        {/* Client Status Doughnut */}
        <div className="card flex flex-col">
          <div className="mb-4">
            <h3 className="font-semibold text-gray-900">حالات العملاء</h3>
            <p className="text-xs text-gray-400 mt-0.5">توزيع مراحل المبيعات</p>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="relative w-40 h-40">
              <Doughnut data={clientStatusData} options={{
                responsive: true,
                plugins: { legend: { display: false } },
                cutout: '72%',
              }} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-2xl font-bold text-gray-900">{stats?.analytics?.conversion_rate ?? 0}%</p>
                <p className="text-[10px] text-gray-400">معدل التحويل</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 w-full text-xs">
              {Object.entries(stats?.clients?.by_status ?? {}).slice(0, 6).map(([k, v]) => (
                <div key={k} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: statusColors[k] ?? '#94a3b8' }} />
                  <span className="text-gray-500 truncate">{clientStatusLabels[k] ?? k}</span>
                  <span className="text-gray-900 font-medium mr-auto">{v as number}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Top Properties */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">أكثر العقارات استفساراً</h3>
            <ArrowTrendingUpIcon className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="space-y-2.5">
            {(stats?.analytics?.top_properties ?? []).length === 0 ? (
              <EmptyState text="لا توجد بيانات عقارات بعد" />
            ) : (stats?.analytics?.top_properties ?? []).map((prop: any, i: number) => (
              <div key={prop.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors group">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-100 text-slate-600' : 'bg-orange-50 text-orange-600'
                }`}>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{prop.title_ar}</p>
                  <p className="text-xs text-gray-400">{prop.city} · {prop.code}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-gray-900">{prop.inquiry_count}</p>
                  <p className="text-[10px] text-gray-400">استفسار</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Clients */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">أحدث العملاء</h3>
            <UsersIcon className="w-4 h-4 text-violet-500" />
          </div>
          <div className="space-y-2.5">
            {(activity?.recent_clients ?? []).length === 0 ? (
              <EmptyState text="لا يوجد عملاء حديثون" />
            ) : (activity?.recent_clients ?? []).slice(0, 5).map((client: any) => (
              <div key={client.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
                <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-sm text-violet-700 bg-violet-100">
                  {client.full_name?.charAt(0) ?? '?'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{client.full_name}</p>
                  <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                    <PhoneIcon className="w-3 h-3" />
                    {client.phone}
                  </p>
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${clientBadge[client.status] ?? 'bg-gray-100 text-gray-500'}`}>
                  {clientStatusLabels[client.status] ?? client.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'إضافة عقار',    icon: BuildingOfficeIcon, href: '/properties', color: 'bg-blue-600 hover:bg-blue-700' },
          { label: 'إضافة عميل',    icon: UsersIcon,          href: '/clients',    color: 'bg-violet-600 hover:bg-violet-700' },
          { label: 'المحادثات',     icon: ChatBubbleLeftRightIcon, href: '/conversations', color: 'bg-emerald-600 hover:bg-emerald-700' },
          { label: 'الصفقات',       icon: CheckCircleIcon,    href: '/deals',      color: 'bg-amber-600 hover:bg-amber-700' },
        ].map(a => (
          <a key={a.href} href={a.href}
            className={`${a.color} text-white rounded-xl px-4 py-3 flex items-center gap-3 text-sm font-medium transition-colors shadow-sm`}>
            <a.icon className="w-5 h-5 flex-shrink-0" />
            {a.label}
          </a>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, icon: Icon, bg, iconColor, trend, valueClass }: any) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        {trend !== 0 && trend !== undefined && (
          <span className={`flex items-center gap-0.5 text-xs font-medium ${trend > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {trend > 0 ? <ArrowTrendingUpIcon className="w-3.5 h-3.5" /> : <ArrowTrendingDownIcon className="w-3.5 h-3.5" />}
            {trend > 0 ? 'ارتفاع' : 'انخفاض'}
          </span>
        )}
      </div>
      <div>
        <p className={`font-bold text-gray-900 leading-none ${valueClass ?? 'text-3xl'}`}>{value}</p>
        <p className="text-sm text-gray-600 font-medium mt-1.5">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="py-8 text-center">
      <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
        <span className="text-2xl">📭</span>
      </div>
      <p className="text-sm text-gray-400">{text}</p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 bg-gray-200 rounded-xl w-48" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
            <div className="w-10 h-10 bg-gray-100 rounded-xl" />
            <div className="h-8 bg-gray-100 rounded-lg w-16" />
            <div className="h-4 bg-gray-100 rounded-lg w-24" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card lg:col-span-2 h-64 bg-gray-50" />
        <div className="card h-64 bg-gray-50" />
      </div>
    </div>
  );
}