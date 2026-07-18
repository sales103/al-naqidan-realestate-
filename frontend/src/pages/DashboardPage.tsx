import { useQuery } from '@tanstack/react-query';
import {
  BuildingOfficeIcon, UsersIcon, ChatBubbleLeftRightIcon,
  CurrencyDollarIcon, ArrowTrendingUpIcon, PhoneIcon,
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
  new: 'جديد', contacted: 'تم التواصل', interested: 'مهتم',
  viewing_scheduled: 'موعد مشاهدة', negotiating: 'تفاوض',
  contract_pending: 'عقد معلق', closed_won: 'اكتمل', closed_lost: 'خسر',
};

const statusColors: Record<string, string> = {
  new: '#3B82F6', contacted: '#8B5CF6', interested: '#10B981',
  viewing_scheduled: '#F59E0B', negotiating: '#EF4444',
  contract_pending: '#EC4899', closed_won: '#059669', closed_lost: '#6B7280',
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

  const stats = statsRes?.data?.data;
  const activity = activityRes?.data?.data;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">جاري تحميل البيانات...</p>
        </div>
      </div>
    );
  }

  const messageChartData = {
    labels: stats?.analytics?.message_chart?.map((d: any) =>
      format(new Date(d.date), 'dd/MM', { locale: ar })
    ) ?? [],
    datasets: [{
      label: 'الرسائل',
      data: stats?.analytics?.message_chart?.map((d: any) => d.count) ?? [],
      borderColor: '#3B82F6',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      fill: true,
      tension: 0.4,
      pointRadius: 4,
    }],
  };

  const clientStatusData = {
    labels: Object.entries(stats?.clients?.by_status ?? {}).map(([k]) => clientStatusLabels[k] ?? k),
    datasets: [{
      data: Object.values(stats?.clients?.by_status ?? {}),
      backgroundColor: Object.keys(stats?.clients?.by_status ?? {}).map((k) => statusColors[k] ?? '#94A3B8'),
      borderWidth: 0,
    }],
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">لوحة التحكم</h2>
          <p className="text-sm text-gray-500 mt-1">
            {format(new Date(), 'EEEE، d MMMM yyyy', { locale: ar })}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-3 py-1.5 rounded-full">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          النظام يعمل بكفاءة
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="إجمالي العقارات"
          value={stats?.properties?.available ?? 0}
          sub={`من ${stats?.properties?.total ?? 0} عقار`}
          icon={BuildingOfficeIcon}
          iconBg="bg-blue-100"
          iconColor="text-blue-600"
          trend={stats?.properties?.available}
        />
        <StatCard
          label="عملاء اليوم"
          value={stats?.clients?.new_today ?? 0}
          sub={`${stats?.clients?.total ?? 0} إجمالي`}
          icon={UsersIcon}
          iconBg="bg-purple-100"
          iconColor="text-purple-600"
        />
        <StatCard
          label="رسائل اليوم"
          value={stats?.conversations?.total_messages_today ?? 0}
          sub={`${stats?.conversations?.ai_responses_today ?? 0} ردود ذكاء اصطناعي`}
          icon={ChatBubbleLeftRightIcon}
          iconBg="bg-green-100"
          iconColor="text-green-600"
        />
        <StatCard
          label="إجمالي المبيعات"
          value={`${((stats?.deals?.total_revenue ?? 0) / 1_000_000).toFixed(1)}م`}
          sub={`${stats?.deals?.completed ?? 0} صفقة مكتملة`}
          icon={CurrencyDollarIcon}
          iconBg="bg-yellow-100"
          iconColor="text-yellow-600"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Messages Chart */}
        <div className="card lg:col-span-2">
          <h3 className="font-semibold text-gray-900 mb-4">نشاط الرسائل (آخر 7 أيام)</h3>
          <Line
            data={messageChartData}
            options={{
              responsive: true,
              plugins: { legend: { display: false } },
              scales: {
                y: { beginAtZero: true, grid: { color: '#F3F4F6' } },
                x: { grid: { display: false } },
              },
            }}
          />
        </div>

        {/* Client Status Doughnut */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">حالات العملاء</h3>
          <Doughnut
            data={clientStatusData}
            options={{
              responsive: true,
              plugins: {
                legend: { position: 'bottom', labels: { usePointStyle: true, padding: 12 } },
              },
              cutout: '60%',
            }}
          />
          <div className="mt-4 text-center">
            <p className="text-3xl font-bold text-gray-900">{stats?.analytics?.conversion_rate ?? 0}%</p>
            <p className="text-xs text-gray-500 flex items-center justify-center gap-1 mt-1">
              <ArrowTrendingUpIcon className="w-3 h-3 text-green-500" />
              معدل التحويل
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Properties */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">أكثر العقارات استفساراً</h3>
          <div className="space-y-3">
            {(stats?.analytics?.top_properties ?? []).map((prop: any, i: number) => (
              <div key={prop.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                <span className="w-8 h-8 bg-blue-100 text-blue-700 rounded-lg flex items-center justify-center text-sm font-bold">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{prop.title_ar}</p>
                  <p className="text-xs text-gray-500">{prop.city} · {prop.code}</p>
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-gray-900">{prop.inquiry_count}</p>
                  <p className="text-xs text-gray-500">استفسار</p>
                </div>
              </div>
            ))}
            {!stats?.analytics?.top_properties?.length && (
              <p className="text-gray-400 text-sm text-center py-4">لا توجد بيانات</p>
            )}
          </div>
        </div>

        {/* Recent Clients */}
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4">أحدث العملاء</h3>
          <div className="space-y-3">
            {(activity?.recent_clients ?? []).slice(0, 5).map((client: any) => (
              <div key={client.id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                <div className="w-9 h-9 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-purple-700">
                    {client.full_name?.charAt(0)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{client.full_name}</p>
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <PhoneIcon className="w-3 h-3" />
                    {client.phone}
                  </p>
                </div>
                <ClientStatusBadge status={client.status} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, icon: Icon, iconBg, iconColor }: any) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${iconBg}`}>
        <Icon className={`w-6 h-6 ${iconColor}`} />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-600 font-medium mt-0.5">{label}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function ClientStatusBadge({ status }: { status: string }) {
  const configs: Record<string, { label: string; className: string }> = {
    new: { label: 'جديد', className: 'badge bg-blue-100 text-blue-700' },
    contacted: { label: 'تواصل', className: 'badge bg-purple-100 text-purple-700' },
    interested: { label: 'مهتم', className: 'badge bg-green-100 text-green-700' },
    closed_won: { label: 'اكتمل', className: 'badge bg-emerald-100 text-emerald-700' },
    closed_lost: { label: 'خسر', className: 'badge bg-gray-100 text-gray-600' },
  };
  const config = configs[status] ?? { label: status, className: 'badge bg-gray-100 text-gray-600' };
  return <span className={config.className}>{config.label}</span>;
}
