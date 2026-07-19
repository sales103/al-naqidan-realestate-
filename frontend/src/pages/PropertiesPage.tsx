import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PlusIcon, MagnifyingGlassIcon, MapPinIcon, HomeIcon,
  XMarkIcon, PhotoIcon, TrashIcon, PencilSquareIcon,
} from '@heroicons/react/24/outline';
import { propertiesApi } from '../services/api.ts';

const propertyTypeLabels: Record<string, string> = {
  land: 'أرض', apartment: 'شقة', villa: 'فيلا', building: 'عمارة',
  office: 'مكتب', showroom: 'معرض', warehouse: 'مستودع',
  farm: 'مزرعة', investment_project: 'مشروع استثماري', other: 'أخرى',
};

const statusLabels: Record<string, { label: string; color: string }> = {
  available:   { label: 'متاح',   color: 'bg-green-100 text-green-700' },
  reserved:    { label: 'محجوز',  color: 'bg-yellow-100 text-yellow-700' },
  sold:        { label: 'مباع',   color: 'bg-gray-100 text-gray-600' },
  rented:      { label: 'مؤجر',   color: 'bg-blue-100 text-blue-700' },
  coming_soon: { label: 'قريباً', color: 'bg-purple-100 text-purple-700' },
};

const emptyForm = {
  title: '', property_type: 'apartment', purpose: 'sale', status: 'available',
  price: '', area_sqm: '', rooms: '', bathrooms: '', address: '', description_ar: '',
  is_featured: false, negotiable: true,
  main_image_url: '', extra_images: [] as string[],
};

function PropertyModal({ property, onClose }: { property?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!property;
  const [form, setForm] = useState(isEdit ? {
    title:          property.title_ar ?? property.title ?? '',
    property_type:  property.property_type ?? 'apartment',
    purpose:        property.purpose ?? 'sale',
    status:         property.status ?? 'available',
    price:          property.price ?? '',
    area_sqm:       property.area_sqm ?? '',
    rooms:          property.rooms ?? '',
    bathrooms:      property.bathrooms ?? '',
    address:        property.address ?? '',
    description_ar: property.description_ar ?? '',
    is_featured:    property.is_featured ?? false,
    negotiable:     property.negotiable ?? true,
    main_image_url: property.main_image_url ?? '',
    extra_images:   (property.media ?? []).map((m: any) => m.url).filter(Boolean) as string[],
  } : { ...emptyForm });

  const [newImageUrl, setNewImageUrl] = useState('');
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const addImage = () => {
    const url = newImageUrl.trim();
    if (!url) return;
    set('extra_images', [...form.extra_images, url]);
    setNewImageUrl('');
  };

  const removeImage = (i: number) =>
    set('extra_images', form.extra_images.filter((_, idx) => idx !== i));

  const createMut = useMutation({
    mutationFn: (data: any) => propertiesApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['properties'] }); onClose(); },
  });
  const updateMut = useMutation({
    mutationFn: (data: any) => propertiesApi.update(property.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['properties'] }); onClose(); },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      title: form.title, title_ar: form.title,
      property_type: form.property_type,
      purpose: form.purpose,
      status: form.status,
      price:     parseFloat(String(form.price))     || undefined,
      area_sqm:  parseFloat(String(form.area_sqm))  || undefined,
      rooms:     parseInt(String(form.rooms))        || undefined,
      bathrooms: parseInt(String(form.bathrooms))    || undefined,
      address:        form.address        || undefined,
      description_ar: form.description_ar || undefined,
      is_featured: form.is_featured,
      negotiable:  form.negotiable,
      main_image_url: form.main_image_url || undefined,
      images: [
        ...(form.main_image_url ? [form.main_image_url] : []),
        ...form.extra_images,
      ],
    };
    if (isEdit) updateMut.mutate(payload);
    else createMut.mutate(payload);
  };

  const isPending = createMut.isPending || updateMut.isPending;
  const error = (createMut.error || updateMut.error) as any;

  // Preview: show first valid image
  const previewImage = form.main_image_url || form.extra_images[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="text-lg font-bold">{isEdit ? 'تعديل العقار' : 'إضافة عقار جديد'}</h3>
          <button onClick={onClose}><XMarkIcon className="w-5 h-5 text-gray-400" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">

          {/* ── صور العقار ── */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">📸 صور العقار</label>

            {/* Image preview */}
            {previewImage ? (
              <div className="relative h-40 rounded-xl overflow-hidden bg-gray-100">
                <img src={previewImage} alt="preview" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                <span className="absolute bottom-2 right-3 text-white text-xs bg-black/40 px-2 py-0.5 rounded-full">
                  {form.extra_images.length + (form.main_image_url ? 1 : 0)} صورة
                </span>
              </div>
            ) : (
              <div className="h-32 rounded-xl bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center">
                <div className="text-center text-gray-400">
                  <PhotoIcon className="w-8 h-8 mx-auto mb-1" />
                  <p className="text-xs">أضف روابط الصور</p>
                </div>
              </div>
            )}

            {/* Main image URL */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">رابط الصورة الرئيسية</label>
              <input
                className="input w-full text-sm"
                value={form.main_image_url}
                onChange={(e) => set('main_image_url', e.target.value)}
                placeholder="https://example.com/image.jpg"
                dir="ltr"
              />
            </div>

            {/* Extra images */}
            {form.extra_images.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {form.extra_images.map((url, i) => (
                  <div key={i} className="relative group w-16 h-16 rounded-lg overflow-hidden bg-gray-100">
                    <img src={url} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as any).src = ''; }} />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                    >
                      <TrashIcon className="w-4 h-4 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add extra image */}
            <div className="flex gap-2">
              <input
                className="input flex-1 text-sm"
                value={newImageUrl}
                onChange={(e) => setNewImageUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addImage())}
                placeholder="رابط صورة إضافية..."
                dir="ltr"
              />
              <button type="button" onClick={addImage}
                className="btn-secondary px-3 text-sm whitespace-nowrap">
                + إضافة
              </button>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4 space-y-4">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">العنوان *</label>
              <input required className="input w-full" value={form.title}
                onChange={(e) => set('title', e.target.value)} placeholder="مثال: شقة في حي النرجس" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">النوع</label>
                <select className="input w-full" value={form.property_type} onChange={(e) => set('property_type', e.target.value)}>
                  {Object.entries(propertyTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الغرض</label>
                <select className="input w-full" value={form.purpose} onChange={(e) => set('purpose', e.target.value)}>
                  <option value="sale">بيع</option>
                  <option value="rent">إيجار</option>
                  <option value="both">بيع وإيجار</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">السعر (ريال)</label>
                <input className="input w-full" type="number" value={form.price}
                  onChange={(e) => set('price', e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">المساحة (م²)</label>
                <input className="input w-full" type="number" value={form.area_sqm}
                  onChange={(e) => set('area_sqm', e.target.value)} placeholder="0" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الغرف</label>
                <input className="input w-full" type="number" value={form.rooms}
                  onChange={(e) => set('rooms', e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الحمامات</label>
                <input className="input w-full" type="number" value={form.bathrooms}
                  onChange={(e) => set('bathrooms', e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">الحالة</label>
                <select className="input w-full" value={form.status} onChange={(e) => set('status', e.target.value)}>
                  {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الموقع / الحي</label>
              <input className="input w-full" value={form.address}
                onChange={(e) => set('address', e.target.value)} placeholder="مثال: حي النرجس، الرياض" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">الوصف</label>
              <textarea className="input w-full" rows={3} value={form.description_ar}
                onChange={(e) => set('description_ar', e.target.value)} placeholder="وصف العقار..." />
            </div>

            <div className="flex gap-5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_featured}
                  onChange={(e) => set('is_featured', e.target.checked)} className="w-4 h-4 accent-blue-600" />
                <span className="text-sm">عقار مميز ⭐</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.negotiable}
                  onChange={(e) => set('negotiable', e.target.checked)} className="w-4 h-4 accent-blue-600" />
                <span className="text-sm">قابل للتفاوض</span>
              </label>
            </div>
          </div>

          {error && <p className="text-red-500 text-sm">{error?.response?.data?.error ?? 'حدث خطأ'}</p>}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={isPending} className="btn-primary flex-1 justify-center">
              {isPending ? 'جارٍ الحفظ...' : isEdit ? 'حفظ التعديلات' : 'إضافة العقار'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">إلغاء</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PropertiesPage() {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ property_type: '', status: '', city_id: '' });
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<{ open: boolean; property?: any }>({ open: false });

  const { data: citiesRes } = useQuery({ queryKey: ['cities'], queryFn: propertiesApi.cities });

  const { data, isLoading } = useQuery({
    queryKey: ['properties', filters, page, search],
    queryFn: () => propertiesApi.search({
      ...(filters.property_type ? { property_type: filters.property_type } : {}),
      ...(filters.city_id      ? { city_id: filters.city_id }             : {}),
      ...(filters.status       ? { status: filters.status }               : {}),
      page, limit: 12,
      search: search || undefined,
    }),
    placeholderData: (prev: any) => prev,
  });

  const properties  = (data as any)?.data?.data ?? [];
  const pagination  = (data as any)?.data?.pagination;

  return (
    <div className="space-y-6">
      {modal.open && (
        <PropertyModal property={modal.property} onClose={() => setModal({ open: false })} />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">إدارة العقارات</h2>
          <p className="text-sm text-gray-500 mt-1">{pagination?.total ?? 0} عقار</p>
        </div>
        <button className="btn-primary" onClick={() => setModal({ open: true })}>
          <PlusIcon className="w-5 h-5" />
          إضافة عقار
        </button>
      </div>

      {/* Filters */}
      <div className="card !p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <MagnifyingGlassIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="بحث عن عقار..." className="input pr-9 w-full" />
          </div>
          <select value={filters.property_type}
            onChange={(e) => { setFilters((f) => ({ ...f, property_type: e.target.value })); setPage(1); }}
            className="input w-auto min-w-36">
            <option value="">جميع الأنواع</option>
            {Object.entries(propertyTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filters.status}
            onChange={(e) => { setFilters((f) => ({ ...f, status: e.target.value })); setPage(1); }}
            className="input w-auto min-w-32">
            <option value="">جميع الحالات</option>
            {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filters.city_id}
            onChange={(e) => { setFilters((f) => ({ ...f, city_id: e.target.value })); setPage(1); }}
            className="input w-auto min-w-36">
            <option value="">جميع المدن</option>
            {((citiesRes as any)?.data?.data ?? []).map((c: any) => (
              <option key={c.id} value={c.id}>{c.name_ar}</option>
            ))}
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
          <button className="btn-primary mt-4" onClick={() => setModal({ open: true })}>
            <PlusIcon className="w-4 h-4" /> إضافة أول عقار
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {properties.map((prop: any) => (
            <PropertyCard key={prop.id} property={prop}
              onEdit={() => setModal({ open: true, property: prop })} />
          ))}
        </div>
      )}

      {pagination && pagination.total_pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage((p) => p - 1)} disabled={page === 1}
            className="btn-secondary disabled:opacity-40">السابق</button>
          <span className="text-sm text-gray-600 px-3">صفحة {page} من {pagination.total_pages}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={page >= pagination.total_pages}
            className="btn-secondary disabled:opacity-40">التالي</button>
        </div>
      )}
    </div>
  );
}

function PropertyCard({ property, onEdit }: { property: any; onEdit: () => void }) {
  const status = statusLabels[property.status] ?? { label: property.status, color: 'bg-gray-100 text-gray-600' };

  return (
    <div className="card !p-0 overflow-hidden group hover:shadow-md transition-shadow">
      <div className="relative h-48 bg-gray-100 overflow-hidden">
        {property.main_image_url ? (
          <img src={property.main_image_url} alt={property.title_ar}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-300">
            <PhotoIcon className="w-10 h-10 mb-1" />
            <span className="text-xs">لا توجد صورة</span>
          </div>
        )}
        <div className="absolute top-3 right-3 flex gap-1.5">
          <span className={`badge ${status.color}`}>{status.label}</span>
        </div>
        {property.is_featured && (
          <div className="absolute top-3 left-3">
            <span className="badge bg-yellow-400 text-yellow-900">مميز ⭐</span>
          </div>
        )}
        {property.code && (
          <div className="absolute bottom-3 right-3 bg-black/50 text-white text-xs px-2 py-1 rounded-lg font-mono">
            {property.code}
          </div>
        )}
        {/* Edit button overlay */}
        <button
          onClick={onEdit}
          className="absolute bottom-3 left-3 bg-white/90 text-gray-700 hover:bg-white p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow"
        >
          <PencilSquareIcon className="w-4 h-4" />
        </button>
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 truncate">{property.title_ar ?? property.title}</h3>
        <div className="flex items-center gap-1.5 text-gray-500 text-sm mt-1">
          <MapPinIcon className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">
            {[property.district_name, property.city_name].filter(Boolean).join(' - ') || property.address || 'غير محدد'}
          </span>
        </div>
        <div className="flex items-center justify-between mt-3">
          <div>
            <span className="text-xs text-gray-400">{propertyTypeLabels[property.property_type ?? property.type] ?? ''}</span>
            {(property.area_sqm || property.area) && (
              <span className="text-xs text-gray-400 mr-2">• {(property.area_sqm || property.area).toLocaleString('ar-SA')} م²</span>
            )}
            {property.rooms && (
              <span className="text-xs text-gray-400 mr-2">• {property.rooms} غرف</span>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between mt-2">
          <div className="text-lg font-bold text-blue-700">
            {property.price ? `${property.price.toLocaleString('ar-SA')} ر` : 'السعر عند الطلب'}
          </div>
          <button onClick={onEdit}
            className="text-xs text-gray-400 hover:text-blue-600 flex items-center gap-1 transition-colors">
            <PencilSquareIcon className="w-3.5 h-3.5" />
            تعديل
          </button>
        </div>
      </div>
    </div>
  );
}
