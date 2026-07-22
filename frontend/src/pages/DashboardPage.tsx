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
import { NavLink } from 'react-router-dom';

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
  new:               '#3B5BDB',
  contacted:         '#7C3AED',
  interested:        '#059669',
  viewing_scheduled: '#C8A84B',
  negotiating:       '#EF4444',
  contract_pending:  '#EC4899',
  closed_won:        '#10B981',
  closed_lost:       '#64748B',
};

const clientBadge: Record<string, { bg: string; color: string }> = {
  new:               { bg: 'rgba(59,91,219,0.1)',  color: '#3B5BDB' },
  contacted:         { bg: 'rgba(124,58,237,0.1)', color: '#7C3AED' },
  interested:        { bg: 'rgba(5,150,105,0.1)',  color: '#059669' },
  viewing_scheduled: { bg: 'rgba(200,168,75,0.12)',color: '#A8892E' },
  negotiating:       { bg: 'rgba(239,68,68,0.1)',  color: '#DC2626' },
  closed_won:        { bg: 'rgba(16,185,129,0.1)', color: '#059669' },
  closed_lost:       { bg: 'rgba(100,116,139,0.1)',color: '#64748B' },
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
      borderColor: '#3B5BDB',
      backgroundColor: 'rgba(59,91,219,0.06)',
      fill: true,
      tension: 0.45,
      pointRadius: 4,
      pointBackgroundColor: '#fff',
      pointBorderColor: '#3B5BDB',
      pointBorderWidth: 2,
      pointHoverRadius: 6,
      borderWidth: 2.5,
    }],
  };

  const clientStatusData = {
    labels: Object.entries(stats?.clients?.by_status ?? {}).map(([k]) => clientStatusLabels[k] ?? k),
    datasets: [{
      data: Object.values(stats?.clients?.by_status ?? {}),
      backgroundColor: Object.keys(stats?.clients?.by_status ?? {}).map(k => statusColors[k] ?? '#94A3B8'),
      borderWidth: 0,
      hoverOffset: 6,
    }],
  };

  const totalRevM = ((stats?.deals?.total_revenue ?? 0) / 1_000_000).toFixed(1);

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: '#0F1C35', letterSpacing: '-0.02em' }}>لوحة التحكم</h2>
          <p className="text-sm mt-0.5" style={{ color: '#7A8FAA' }}>
            {format(new Date(), 'EEEE، d MMMM yyyy', { locale: ar })}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold px-3.5 py-2 rounded-full" style={{
          background: 'rgba(5,150,105,0.08)',
          color: '#059669',
          border: '1px solid rgba(5,150,105,0.15)',
        }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#22C55E', boxShadow: '0 0 6px rgba(34,197,94,0.5)' }} />
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
          variant="royal"
          trend={+2}
        />
        <StatCard
          label="عملاء اليوم"
          value={stats?.clients?.new_today ?? 0}
          sub={`${stats?.clients?.total ?? 0} إجمالي`}
          icon={UsersIcon}
          variant="purple"
          trend={stats?.clients?.new_today > 0 ? +1 : 0}
        />
        <StatCard
          label="رسائل اليوم"
          value={stats?.conversations?.total_messages_today ?? 0}
          sub={`${stats?.conversations?.ai_responses_today ?? 0} ردود AI`}
          icon={ChatBubbleLeftRightIcon}
          variant="emerald"
          trend={+1}
        />
        <StatCard
          label="إجمالي المبيعات"
          value={`${totalRevM}م`}
          sub={`${stats?.deals?.completed ?? 0} صفقة مكتملة`}
          icon={CurrencyDollarIcon}
          variant="gold"
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
              <h3 className="font-bold text-base" style={{ color: '#0F1C35' }}>نشاط الرسائل</h3>
              <p className="text-xs mt-0.5" style={{ color: '#7A8FAA' }}>آخر 7 أيام</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full" style={{
              background: 'rgba(59,91,219,0.08)',
              color: '#3B5BDB',
              border: '1px solid rgba(59,91,219,0.12)',
            }}>
              <SparklesIcon className="w-3.5 h-3.5" />
              مدعوم بالذكاء الاصطناعي
            </div>
          </div>
          <Line data={messageChartData} options={{
            responsive: true,
            plugins: {
              legend: { display: false },
              tooltip: {
                rtl: true,
                bodyFont: { family: 'IBM Plex Sans Arabic' },
                backgroundColor: 'rgba(15,28,53,0.92)',
                titleColor: '#E8EDF5',
                bodyColor: '#94A3B8',
                padding: 12,
                cornerRadius: 10,
                borderColor: 'rgba(59,91,219,0.2)',
                borderWidth: 1,
              },
            },
            scales: {
              y: {
                beginAtZero: true,
                grid: { color: 'rgba(59,91,219,0.06)' },
                border: { display: false },
                ticks: { color: '#94A3B8', font: { size: 11 } },
              },
              x: {
                grid: { display: false },
                border: { display: false },
                ticks: { color: '#94A3B8', font: { size: 11 } },
              },
            },
          }} />
        </div>

        {/* Client Status Doughnut */}
        <div className="card flex flex-col">
          <div className="mb-4">
            <h3 className="font-bold text-base" style={{ color: '#0F1C35' }}>حالات العملاء</h3>
            <p className="text-xs mt-0.5" style={{ color: '#7A8FAA' }}>توزيع مراحل المبيعات</p>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="relative w-40 h-40">
              <Doughnut data={clientStatusData} options={{
                responsive: true,
                plugins: { legend: { display: false } },
                cutout: '74%',
              }} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-2xl font-bold" style={{ color: '#0F1C35' }}>{stats?.analytics?.conversion_rate ?? 0}%</p>
                <p className="text-[10px]" style={{ color: '#94A3B8' }}>معدل التحويل</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 w-full text-xs">
              {Object.entries(stats?.clients?.by_status ?? {}).slice(0, 6).map(([k, v]) => (
                <div key={k} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: statusColors[k] ?? '#94A3B8' }} />
                  <span className="truncate" style={{ color: '#7A8FAA' }}>{clientStatusLabels[k] ?? k}</span>
                  <span className="font-bold mr-auto" style={{ color: '#0F1C35' }}>{v as number}</span>
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
            <h3 className="font-bold" style={{ color: '#0F1C35' }}>أكثر العقارات استفساراً</h3>
            <ArrowTrendingUpIcon className="w-4 h-4" style={{ color: '#059669' }} />
          </div>
          <div className="space-y-2">
            {(stats?.analytics?.top_properties ?? []).length === 0 ? (
              <EmptyState text="لا توجد بيانات عقارات بعد" />
            ) : (stats?.analytics?.top_properties ?? []).map((prop: any, i: number) => (
              <div key={prop.id} className="flex items-center gap-3 p-3 rounded-xl transition-colors group" style={{ background: 'rgba(59,91,219,0.03)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,91,219,0.07)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(59,91,219,0.03)')}>
                <span className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0" style={
                  i === 0
                    ? { background: 'rgba(200,168,75,0.15)', color: '#A8892E' }
                    : i === 1
                    ? { background: 'rgba(100,116,139,0.1)', color: '#64748B' }
                    : { background: 'rgba(205,127,50,0.1)', color: '#CD7F32' }
                }>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate" style={{ color: '#0F1C35' }}>{prop.title_ar}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#7A8FAA' }}>{prop.city} · {prop.code}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold" style={{ color: '#3B5BDB' }}>{prop.inquiry_count}</p>
                  <p className="text-[10px]" style={{ color: '#94A3B8' }}>استفسار</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Clients */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold" style={{ color: '#0F1C35' }}>أحدث العملاء</h3>
            <UsersIcon className="w-4 h-4" style={{ color: '#7C3AED' }} />
          </div>
          <div className="space-y-2">
            {(activity?.recent_clients ?? []).length === 0 ? (
              <EmptyState text="لا يوجد عملاء حديثون" />
            ) : (activity?.recent_clients ?? []).slice(0, 5).map((client: any) => (
              <div key={client.id} className="flex items-center gap-3 p-3 rounded-xl transition-colors"
                style={{ background: 'rgba(59,91,219,0.03)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,91,219,0.07)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(59,91,219,0.03)')}>
                <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-sm" style={{
                  background: 'linear-gradient(135deg, rgba(124,58,237,0.15), rgba(59,91,219,0.2))',
                  color: '#7C3AED',
                  border: '1px solid rgba(124,58,237,0.15)',
                }}>
                  {client.full_name?.charAt(0) ?? '?'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate" style={{ color: '#0F1C35' }}>{client.full_name}</p>
                  <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: '#94A3B8' }}>
                    <PhoneIcon className="w-3 h-3" />
                    {client.phone}
                  </p>
                </div>
                <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0" style={{
                  background: clientBadge[client.status]?.bg ?? 'rgba(100,116,139,0.1)',
                  color: clientBadge[client.status]?.color ?? '#64748B',
                }}>
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
          {
            label: 'إضافة عقار',
            icon: BuildingOfficeIcon,
            href: '/properties',
            bg: 'linear-gradient(135deg, #3B5BDB, #5273F5)',
            shadow: 'rgba(59,91,219,0.35)',
          },
          {
            label: 'إضافة عميل',
            icon: UsersIcon,
            href: '/clients',
            bg: 'linear-gradient(135deg, #6D28D9, #7C3AED)',
            shadow: 'rgba(109,40,217,0.35)',
          },
          {
            label: 'المحادثات',
            icon: ChatBubbleLeftRightIcon,
            href: '/conversations',
            bg: 'linear-gradient(135deg, #047857, #059669)',
            shadow: 'rgba(4,120,87,0.35)',
          },
          {
            label: 'الصفقات',
            icon: CheckCircleIcon,
            href: '/deals',
            bg: 'linear-gradient(135deg, #A8892E, #C8A84B)',
            shadow: 'rgba(168,137,46,0.4)',
            textColor: '#1a0f00',
          },
        ].map(a => (
          <NavLink key={a.href} to={a.href}
            className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all duration-200"
            style={{ background: a.bg, color: a.textColor ?? '#fff', boxShadow: `0 2px 12px ${a.shadow}` }}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLAnchorElement).style.boxShadow = `0 6px 20px ${a.shadow}`; }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.transform = 'none'; (e.currentTarget as HTMLAnchorElement).style.boxShadow = `0 2px 12px ${a.shadow}`; }}>
            <a.icon className="w-5 h-5 flex-shrink-0" />
            {a.label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, icon: Icon, variant, trend, valueClass }: any) {
  const variants: Record<string, { bg: string; border: string; shadow: string; iconBg: string; iconColor: string; valueColor: string; subColor: string; labelColor: string; trendBg: string; trendColor: string }> = {
    royal: {
      bg: 'linear-gradient(135deg, #f0f4ff 0%, #e8eeff 100%)',
      border: 'rgba(59,91,219,0.12)',
      shadow: 'rgba(59,91,219,0.08)',
      iconBg: 'rgba(59,91,219,0.12)',
      iconColor: '#3B5BDB',
      valueColor: '#1A2E50',
      labelColor: '#3B5BDB',
      subColor: '#7A8FAA',
      trendBg: 'rgba(5,150,105,0.1)',
      trendColor: '#059669',
    },
    purple: {
      bg: 'linear-gradient(135deg, #f5f0ff 0%, #ede8ff 100%)',
      border: 'rgba(124,58,237,0.12)',
      shadow: 'rgba(124,58,237,0.08)',
      iconBg: 'rgba(124,58,237,0.12)',
      iconColor: '#7C3AED',
      valueColor: '#1A2E50',
      labelColor: '#7C3AED',
      subColor: '#7A8FAA',
      trendBg: 'rgba(5,150,105,0.1)',
      trendColor: '#059669',
    },
    emerald: {
      bg: 'linear-gradient(135deg, #f0fdf9 0%, #e8faf4 100%)',
      border: 'rgba(5,150,105,0.12)',
      shadow: 'rgba(5,150,105,0.08)',
      iconBg: 'rgba(5,150,105,0.12)',
      iconColor: '#059669',
      valueColor: '#1A2E50',
      labelColor: '#059669',
      subColor: '#7A8FAA',
      trendBg: 'rgba(5,150,105,0.1)',
      trendColor: '#059669',
    },
    gold: {
      bg: 'linear-gradient(135deg, #fffbf0 0%, #fef7e0 100%)',
      border: 'rgba(200,168,75,0.18)',
      shadow: 'rgba(200,168,75,0.1)',
      iconBg: 'rgba(200,168,75,0.15)',
      iconColor: '#A8892E',
      valueColor: '#1A2E50',
      labelColor: '#A8892E',
      subColor: '#7A8FAA',
      trendBg: 'rgba(5,150,105,0.1)',
      trendColor: '#059669',
    },
  };

  const v = variants[variant] ?? variants.royal;

  return (
    <div className="rounded-2xl p-5 flex flex-col gap-3" style={{
      background: v.bg,
      border: `1px solid ${v.border}`,
      boxShadow: `0 2px 12px ${v.shadow}`,
      transition: 'box-shadow 0.2s ease, transform 0.2s ease',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = `0 6px 24px ${v.shadow}`; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = `0 2px 12px ${v.shadow}`; (e.currentTarget as HTMLDivElement).style.transform = 'none'; }}>
      <div className="flex items-center justify-between">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: v.iconBg }}>
          <Icon className="w-5 h-5" style={{ color: v.iconColor }} />
        </div>
        {trend !== 0 && trend !== undefined && (
          <span className="flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full" style={{
            background: trend > 0 ? v.trendBg : 'rgba(239,68,68,0.1)',
            color: trend > 0 ? v.trendColor : '#EF4444',
          }}>
            {trend > 0 ? <ArrowTrendingUpIcon className="w-3.5 h-3.5" /> : <ArrowTrendingDownIcon className="w-3.5 h-3.5" />}
            {trend > 0 ? 'ارتفاع' : 'انخفاض'}
          </span>
        )}
      </div>
      <div>
        <p className={`font-bold leading-none ${valueClass ?? 'text-3xl'}`} style={{ color: v.valueColor }}>{value}</p>
        <p className="text-sm font-semibold mt-1.5" style={{ color: v.labelColor }}>{label}</p>
        {sub && <p className="text-xs mt-0.5" style={{ color: v.subColor }}>{sub}</p>}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="py-8 text-center">
      <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: 'rgba(59,91,219,0.06)' }}>
        <span className="text-2xl">📭</span>
      </div>
      <p className="text-sm" style={{ color: '#94A3B8' }}>{text}</p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 rounded-xl w-48" style={{ background: 'rgba(59,91,219,0.08)' }} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-2xl p-5 space-y-3" style={{ background: 'rgba(59,91,219,0.05)', border: '1px solid rgba(59,91,219,0.08)' }}>
            <div className="w-10 h-10 rounded-xl" style={{ background: 'rgba(59,91,219,0.08)' }} />
            <div className="h-8 rounded-lg w-16" style={{ background: 'rgba(59,91,219,0.08)' }} />
            <div className="h-4 rounded-lg w-24" style={{ background: 'rgba(59,91,219,0.06)' }} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card lg:col-span-2 h-64" style={{ background: 'rgba(59,91,219,0.03)' }} />
        <div className="card h-64" style={{ background: 'rgba(59,91,219,0.03)' }} />
      </div>
    </div>
  );
}
