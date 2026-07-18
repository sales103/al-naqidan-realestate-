import { useQuery } from '@tanstack/react-query';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { dashboardApi } from '../services/api.ts';
import { ArrowDownTrayIcon, ChartBarIcon } from '@heroicons/react/24/outline';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export default function ReportsPage() {
  const { data: statsRes } = useQuery({ queryKey: ['dashboard-stats'], queryFn: dashboardApi.stats });
  const stats = statsRes?.data?.data;

  const propertyByTypeData = {
    labels: Object.keys(stats?.properties?.by_type ?? {}).map((k) => ({
      land: 'أراضي', apartment: 'شقق', villa: 'فلل', building: 'عمائر',
      office: 'مكاتب', showroom: 'معارض', warehouse: 'مستودعات',
      farm: 'مزارع', investment_project: 'مشاريع', other: 'أخرى',
    }[k] ?? k)),
    datasets: [{
      label: 'العقارات',
      data: Object.values(stats?.properties?.by_type ?? {}),
      backgroundColor: ['#3B82F6','#8B5CF6','#10B981','#F59E0B','#EF4444','#EC4899','#06B6D4','#84CC16','#F97316','#6B7280'],
      borderRadius: 8,
    }],
  };

  const clientStatusData = {
    labels: Object.keys(stats?.clients?.by_status ?? {}).map((k) => ({
      new: 'جديد', contacted: 'تواصل', interested: 'مهتم',
      viewing_scheduled: 'موعد', negotiating: 'تفاوض',
      contract_pending: 'عقد', closed_won: 'اكتمل', closed_lost: 'خسر',
    }[k] ?? k)),
    datasets: [{
      label: 'العملاء',
      data: Object.values(stats?.clients?.by_status ?? {}),
      backgroundColor: '#3B82F6',
      borderRadius: 8,
    }],
  };

  const chartOptions = {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true }, x: { grid: { display: false } } },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">التقارير والإحصائيات</h2>
          <p className="text-sm text-gray-500 mt-1">نظرة شاملة على أداء الشركة</p>
        </div>
        <button className="btn-secondary">
          <ArrowDownTrayIcon className="w-4 h-4" />
          تصدير PDF
        </button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي العقارات', value: stats?.properties?.total ?? 0, color: 'text-blue-600' },
          { label: 'العقارات المتاحة', value: stats?.properties?.available ?? 0, color: 'text-green-600' },
          { label: 'إجمالي العملاء', value: stats?.clients?.total ?? 0, color: 'text-purple-600' },
          { label: 'الصفقات المكتملة', value: stats?.deals?.completed ?? 0, color: 'text-yellow-600' },
        ].map((kpi) => (
          <div key={kpi.label} className="card text-center">
            <p className={`text-4xl font-bold ${kpi.color}`}>{kpi.value.toLocaleString('ar-SA')}</p>
            <p className="text-sm text-gray-600 mt-1">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <ChartBarIcon className="w-5 h-5 text-blue-600" />
            توزيع العقارات حسب النوع
          </h3>
          <Bar data={propertyByTypeData} options={chartOptions} />
        </div>

        <div className="card">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <ChartBarIcon className="w-5 h-5 text-purple-600" />
            توزيع العملاء حسب الحالة
          </h3>
          <Bar data={clientStatusData} options={chartOptions} />
        </div>
      </div>

      {/* Revenue */}
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-4">ملخص المالي</h3>
        <div className="grid grid-cols-3 gap-6 text-center">
          <div>
            <p className="text-3xl font-bold text-green-600">
              {((stats?.deals?.total_revenue ?? 0) / 1_000_000).toFixed(2)} م
            </p>
            <p className="text-sm text-gray-500 mt-1">إجمالي الإيرادات (ريال)</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-blue-600">{stats?.analytics?.conversion_rate ?? 0}%</p>
            <p className="text-sm text-gray-500 mt-1">معدل التحويل</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-purple-600">{stats?.conversations?.total_messages_today ?? 0}</p>
            <p className="text-sm text-gray-500 mt-1">رسائل اليوم</p>
          </div>
        </div>
      </div>
    </div>
  );
}
