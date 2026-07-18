import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  PlusIcon, MagnifyingGlassIcon,
  MapPinIcon, CurrencyDollarIcon, HomeIcon,
} from '@heroicons/react/24/outline';
import { propertiesApi } from '../services/api.ts';

const propertyTypeLabels: Record<string, string> = {
  land: 'أرض', apartment: 'شقة', villa: 'فيلا', building: 'عمارة',
  office: 'مكتب', showroom: 'معرض', warehouse: 'مستودع',
  farm: 'مزرعة', investment_project: 'مشروع استثماري', other: 'أخرى',
};

const statusLabels: Record<string, { label: string; color: string }> = {
  available: { label: 'متاح', color: 'bg-green-100 text-green-700' },
  reserved: { label: 'محجوز', color: 'bg-yellow-100 text-yellow-700' },
  sold: { label: 'مباع', color: 'bg-gray-100 text-gray-600' },
  rented: { label: 'مؤجر', color: 'bg-blue-100 text-blue-700' },
  coming_soon: { label: 'قريباً', color: 'bg-purple-100 text-purple-700' },
};

export default function PropertiesPage() {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ property_type: '', status: '', city_id: '' });
  const [page, setPage] = useState(1);

  const { data: citiesRes } = useQuery({ queryKey: ['cities'], queryFn: propertiesApi.cities });

  const { data, isLoading } = useQuery({
    queryKey: ['properties', filters, page, search],
    queryFn: () => propertiesApi.search({
      ...filters,
      page,
      limit: 12,
      search: search || undefined,
    }),
    placeholderData: (prev: any) => prev,
  });

  const properties = (data as any)?.data?.data ?? [];
  const pagination = (data as any)?.data?.pagination;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">إدارة العقارات</h2>
          <p className="text-sm text-gray-500 mt-1">{pagination?.total ?? 0} عقار</p>
        </div>
        <button className="btn-primary">
          <PlusIcon className="w-5 h-5" />
          إضافة عقار
        </button>
      </div>

      {/* Filters */}
      <div className="card !p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <MagnifyingGlassIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="بحث عن عقار..."
              className="input pr-9"
            />
          </div>
          <select
            value={filters.property_type}
            onChange={(e) => { setFilters((f) => ({ ...f, property_type: e.target.value })); setPage(1); }}
            className="input w-auto min-w-36"
          >
            <option value="">جميع الأنواع</option>
            {Object.entries(propertyTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select
            value={filters.status}
            onChange={(e) => { setFilters((f) => ({ ...f, status: e.target.value })); setPage(1); }}
            className="input w-auto min-w-32"
          >
            <option value="">جميع الحالات</option>
            {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select
            value={filters.city_id}
            onChange={(e) => { setFilters((f) => ({ ...f, city_id: e.target.value })); setPage(1); }}
            className="input w-auto min-w-36"
          >
            <option value="">جميع المدن</option>
            {(citiesRes?.data?.data ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}
          </select>
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card animate-pulse">
              <div className="w-full h-48 bg-gray-200 rounded-xl mb-4" />
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-200 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : properties.length === 0 ? (
        <div className="card text-center py-16">
          <HomeIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">لا توجد عقارات</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {properties.map((prop: any) => (
            <PropertyCard key={prop.id} property={prop} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.total_pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => p - 1)}
            disabled={page === 1}
            className="btn-secondary disabled:opacity-40"
          >
            السابق
          </button>
          <span className="text-sm text-gray-600 px-3">
            صفحة {page} من {pagination.total_pages}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= pagination.total_pages}
            className="btn-secondary disabled:opacity-40"
          >
            التالي
          </button>
        </div>
      )}
    </div>
  );
}

function PropertyCard({ property }: { property: any }) {
  const status = statusLabels[property.status] ?? { label: property.status, color: 'bg-gray-100 text-gray-600' };

  return (
    <div className="card !p-0 overflow-hidden group cursor-pointer hover:shadow-md transition-shadow">
      {/* Image */}
      <div className="relative h-48 bg-gray-100 overflow-hidden">
        {property.main_image_url ? (
          <img
            src={property.main_image_url}
            alt={property.title_ar}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <HomeIcon className="w-12 h-12 text-gray-300" />
          </div>
        )}
        <div className="absolute top-3 right-3">
          <span className={`badge ${status.color} backdrop-blur-sm`}>{status.label}</span>
        </div>
        {property.is_featured && (
          <div className="absolute top-3 left-3">
            <span className="badge bg-yellow-400 text-yellow-900">مميز ⭐</span>
          </div>
        )}
        <div className="absolute bottom-3 right-3 bg-black/50 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-lg">
          {property.code}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 truncate">
          {property.title_ar ?? property.title}
        </h3>
        <div className="flex items-center gap-1.5 text-gray-500 text-sm mt-1">
          <MapPinIcon className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">
            {[property.district_name, property.city_name].filter(Boolean).join(' - ') || 'غير محدد'}
          </span>
        </div>

        <div className="flex items-center justify-between mt-3">
          <div>
            <span className="text-xs text-gray-400">{propertyTypeLabels[property.property_type] ?? property.property_type}</span>
            {property.area_sqm && (
              <span className="text-xs text-gray-400 mx-2">· {property.area_sqm.toLocaleString('ar-SA')} م²</span>
            )}
          </div>
        </div>

        {property.price && (
          <div className="mt-3 flex items-center gap-1 text-blue-700 font-bold">
            <CurrencyDollarIcon className="w-4 h-4" />
            <span>{property.price.toLocaleString('ar-SA')}</span>
            <span className="text-xs font-normal text-gray-500">ريال</span>
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <button className="flex-1 btn-primary text-xs py-1.5 justify-center">عرض التفاصيل</button>
          <button className="btn-secondary text-xs py-1.5">تعديل</button>
        </div>
      </div>
    </div>
  );
}
