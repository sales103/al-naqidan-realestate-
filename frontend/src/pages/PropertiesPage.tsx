import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PlusIcon, MagnifyingGlassIcon, MapPinIcon, HomeIcon,
  XMarkIcon, PhotoIcon, TrashIcon, PencilSquareIcon,
  StarIcon, FunnelIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarSolid } from '@heroicons/react/24/solid';
import { propertiesApi, uploadsApi } from '../services/api.ts';
import toast from 'react-hot-toast';

const propertyTypeLabels: Record<string, string> = {
  land: 'أرض', apartment: 'شقة', villa: 'فيلا', building: 'عمارة',
  office: 'مكتب', showroom: 'معرض', warehouse: 'مستودع',
  farm: 'مزرعة', investment_project: 'مشروع استثماري', other: 'أخرى',
};

const purposeLabels: Record<string, string> = {
  sale: 'بيع', rent: 'إيجار', both: 'بيع وإيجار',
};

const statusConfig: Record<string, { label: string; color: string; dot: string }> = {
  available:   { label: 'متاح',    color: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200', dot: 'bg-emerald-500' },
  reserved:    { label: 'محجوز',   color: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200',       dot: 'bg-amber-500'   },
  sold:        { label: 'مباع',    color: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200',          dot: 'bg-gray-400'    },
  rented:      { label: 'مؤجر',   color: 'bg-blue-100 text-blue-700 ring-1 ring-blue-200',          dot: 'bg-blue-500'    },
  coming_soon: { label: 'قريباً', color: 'bg-purple-100 text-purple-700 ring-1 ring-purple-200',    dot: 'bg-purple-500'  },
};

const emptyForm = {
  title: '', property_type: 'apartment', purpose: 'sale', status: 'available',
  occupancy_type: '', entrance_type: '',
  price: '', area_sqm: '', rooms: '', bathrooms: '', kitchens: '', living_rooms: '', address: '', google_maps_url: '', description_ar: '',
  is_featured: false, negotiable: true,
  main_image_url: '', extra_images: [] as string[],
  features: [] as string[],
};

// ─── Property Modal ───────────────────────────────────────────────────────────
function PropertyModal({ property, onClose }: { property?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isEdit = !!property;
  const [form, setForm] = useState(isEdit ? {
    title:          property.title_ar ?? property.title ?? '',
    property_type:  property.property_type ?? 'apartment',
    occupancy_type: property.occupancy_type ?? '',
    entrance_type:  property.entrance_type ?? '',
    purpose:        property.purpose ?? 'sale',
    status:         property.status ?? 'available',
    price:          property.price ?? '',
    area_sqm:       property.area_sqm ?? '',
    rooms:          property.rooms ?? '',
    bathrooms:      property.bathrooms ?? '',
    kitchens:       property.kitchens ?? '',
    living_rooms:   property.living_rooms ?? '',
    address:        property.address ?? '',
    google_maps_url: property.google_maps_url ?? '',
    description_ar: property.description_ar ?? '',
    is_featured:    property.is_featured ?? false,
    negotiable:     property.negotiable ?? true,
    main_image_url: property.main_image_url ?? '',
    extra_images:   (property.media ?? []).map((m: any) => m.url).filter(Boolean) as string[],
    features:       (property.features ?? []) as string[],
  } : { ...emptyForm });

  const [newImageUrl, setNewImageUrl] = useState('');
  const [newFeature, setNewFeature] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const addFeature = () => {
    const f = newFeature.trim();
    if (!f || form.features.includes(f)) return;
    set('features', [...form.features, f]);
    setNewFeature('');
  };
  const removeFeature = (i: number) =>
    set('features', form.features.filter((_, idx) => idx !== i));

  const addImage = () => {
    const url = newImageUrl.trim();
    if (!url) return;
    set('extra_images', [...form.extra_images, url]);
    setNewImageUrl('');
  };
  const removeImage = (i: number) =>
    set('extra_images', form.extra_images.filter((_, idx) => idx !== i));

  // Uploads go straight to Cloudinary via the backend — Railway wipes local
  // disk on every redeploy, so a URL that survives has to come from there.
  const handleFilesPicked = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const files = Array.from(fileList).slice(0, 10);
    setIsUploading(true);
    try {
      if (!form.main_image_url && files.length === 1) {
        const { data } = await uploadsApi.image(files[0]!);
        set('main_image_url', data.data.url);
      } else {
        const { data } = await uploadsApi.images(files);
        if (!form.main_image_url) {
          const [first, ...rest] = data.data.urls;
          set('main_image_url', first);
          set('extra_images', [...form.extra_images, ...rest]);
        } else {
          set('extra_images', [...form.extra_images, ...data.data.urls]);
        }
      }
      toast.success(files.length > 1 ? `تم رفع ${files.length} صور` : 'تم رفع الصورة');
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'فشل رفع الصورة');
    } finally {
      setIsUploading(false);
    }
  };

  const createMut = useMutation({
    mutationFn: (data: any) => propertiesApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['properties'] }); toast.success('تم إضافة العقار'); onClose(); },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'حدث خطأ'),
  });
  const updateMut = useMutation({
    mutationFn: (data: any) => propertiesApi.update(property.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['properties'] }); toast.success('تم حفظ التعديلات'); onClose(); },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'حدث خطأ'),
  });
  const deleteMut = useMutation({
    mutationFn: () => propertiesApi.remove(property.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['properties'] }); toast.success('تم حذف العقار'); onClose(); },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'تعذّر حذف العقار'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      title: form.title, title_ar: form.title,
      property_type: form.property_type,
      // '' means the team hasn't specified it; send null so the row stays
      // unclassified and the bot keeps offering it, rather than storing ''.
      occupancy_type: form.occupancy_type || null,
      entrance_type:  form.entrance_type  || null,
      purpose: form.purpose,
      status: form.status,
      price:     parseFloat(String(form.price))    || undefined,
      area_sqm:  parseFloat(String(form.area_sqm)) || undefined,
      rooms:        parseInt(String(form.rooms))        || undefined,
      bathrooms:    parseInt(String(form.bathrooms))    || undefined,
      kitchens:     parseInt(String(form.kitchens))     || undefined,
      living_rooms: parseInt(String(form.living_rooms)) || undefined,
      address:        form.address        || undefined,
      google_maps_url: form.google_maps_url || undefined,
      description_ar: form.description_ar || undefined,
      is_featured: form.is_featured,
      negotiable:  form.negotiable,
      main_image_url: form.main_image_url || undefined,
      images: [
        ...(form.main_image_url ? [form.main_image_url] : []),
        ...form.extra_images,
      ],
      features: form.features,
    };
    if (isEdit) updateMut.mutate(payload);
    else createMut.mutate(payload);
  };

  const isPending = createMut.isPending || updateMut.isPending;
  const previewImage = form.main_image_url || form.extra_images[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-4 border-b z-10">
          <h3 className="text-lg font-bold text-gray-900">
            {isEdit ? 'تعديل العقار' : 'إضافة عقار جديد'}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <XMarkIcon className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Image section */}
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-gray-700">صور العقار</label>

            {previewImage ? (
              <div className="relative h-44 rounded-xl overflow-hidden bg-gray-100 group">
                <img src={previewImage} alt="preview" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                <span className="absolute bottom-3 right-3 text-white text-xs bg-black/50 px-2.5 py-1 rounded-full">
                  {form.extra_images.length + (form.main_image_url ? 1 : 0)} صورة
                </span>
                <button type="button" title="حذف الصورة الرئيسية"
                  onClick={() => {
                    if (form.main_image_url) set('main_image_url', '');
                    else removeImage(0);
                  }}
                  className="absolute top-3 left-3 bg-black/60 hover:bg-red-600 text-white p-1.5 rounded-lg transition-colors">
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className={`h-36 rounded-xl bg-gray-50 border-2 border-dashed flex items-center justify-center cursor-pointer transition-colors ${isUploading ? 'border-primary-300 bg-primary-50' : 'border-gray-200 hover:border-primary-300 hover:bg-primary-50/40'}`}>
                <input
                  type="file" accept="image/jpeg,image/png,image/webp" multiple
                  className="hidden" disabled={isUploading}
                  onChange={(e) => { void handleFilesPicked(e.target.files); e.target.value = ''; }}
                />
                <div className="text-center text-gray-400">
                  <PhotoIcon className="w-9 h-9 mx-auto mb-1.5" />
                  <p className="text-sm">{isUploading ? 'جارِ الرفع...' : 'اضغط لرفع صور من جهازك'}</p>
                </div>
              </label>
            )}

            {form.extra_images.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {form.extra_images.map((url, i) => (
                  <div key={i} className="relative group w-16 h-16 rounded-lg overflow-hidden bg-gray-100 border">
                    <img src={url} alt="" className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <button type="button" onClick={() => removeImage(i)}
                      className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <TrashIcon className="w-4 h-4 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {previewImage && (
              <label className={`flex items-center justify-center gap-2 h-11 rounded-lg border border-dashed text-sm cursor-pointer transition-colors ${isUploading ? 'border-primary-300 text-primary-500 bg-primary-50' : 'border-gray-200 text-gray-500 hover:border-primary-300 hover:bg-primary-50/40'}`}>
                <input
                  type="file" accept="image/jpeg,image/png,image/webp" multiple
                  className="hidden" disabled={isUploading}
                  onChange={(e) => { void handleFilesPicked(e.target.files); e.target.value = ''; }}
                />
                <PhotoIcon className="w-4 h-4" />
                {isUploading ? 'جارِ الرفع...' : '+ رفع صور إضافية'}
              </label>
            )}

            <details className="text-xs text-gray-500">
              <summary className="cursor-pointer select-none hover:text-gray-700">أو أضف رابط صورة جاهز (اختياري)</summary>
              <div className="flex gap-2 mt-2">
                <input
                  className="input flex-1 text-sm" dir="ltr"
                  value={newImageUrl}
                  onChange={(e) => setNewImageUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addImage())}
                  placeholder="https://example.com/image.jpg"
                />
                <button type="button" onClick={addImage}
                  className="btn-secondary px-4 text-sm whitespace-nowrap">
                  + إضافة
                </button>
              </div>
            </details>
          </div>

          <div className="border-t pt-5 space-y-4">
            {/* Title */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">العنوان *</label>
              <input required className="input w-full" value={form.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="مثال: شقة في حي النرجس - 3 غرف" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">النوع</label>
                <select className="input w-full" value={form.property_type}
                  onChange={(e) => set('property_type', e.target.value)}>
                  {Object.entries(propertyTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  الفئة <span className="font-normal" style={{ color: '#94A3B8' }}>(للبوت)</span>
                </label>
                <select className="input w-full" value={form.occupancy_type}
                  onChange={(e) => set('occupancy_type', e.target.value)}>
                  <option value="">غير محدد</option>
                  <option value="family">عوائل</option>
                  <option value="singles">عزاب</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  المدخل <span className="font-normal" style={{ color: '#94A3B8' }}>(للبوت)</span>
                </label>
                <select className="input w-full" value={form.entrance_type}
                  onChange={(e) => set('entrance_type', e.target.value)}>
                  <option value="">غير محدد</option>
                  <option value="private">خاص</option>
                  <option value="shared">مشترك</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">الغرض</label>
                <select className="input w-full" value={form.purpose}
                  onChange={(e) => set('purpose', e.target.value)}>
                  {Object.entries(purposeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">السعر (ريال)</label>
                <input className="input w-full" type="number" min="0" value={form.price}
                  onChange={(e) => set('price', e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">المساحة (م²)</label>
                <input className="input w-full" type="number" min="0" value={form.area_sqm}
                  onChange={(e) => set('area_sqm', e.target.value)} placeholder="0" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">الغرف</label>
                <input className="input w-full" type="number" min="0" value={form.rooms}
                  onChange={(e) => set('rooms', e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">الحمامات</label>
                <input className="input w-full" type="number" min="0" value={form.bathrooms}
                  onChange={(e) => set('bathrooms', e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">الحالة</label>
                <select className="input w-full" value={form.status}
                  onChange={(e) => set('status', e.target.value)}>
                  {Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">المطبخ</label>
                <input className="input w-full" type="number" min="0" value={form.kitchens}
                  onChange={(e) => set('kitchens', e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">الصالة</label>
                <input className="input w-full" type="number" min="0" value={form.living_rooms}
                  onChange={(e) => set('living_rooms', e.target.value)} placeholder="0" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">الموقع / الحي</label>
              <input className="input w-full" value={form.address}
                onChange={(e) => set('address', e.target.value)}
                placeholder="مثال: حي النرجس، الرياض" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                رابط الموقع على خرائط جوجل <span className="text-xs font-normal text-gray-400">(اختياري — يُرسله البوت كموقع للعميل)</span>
              </label>
              <input className="input w-full text-sm" dir="ltr" value={form.google_maps_url}
                onChange={(e) => set('google_maps_url', e.target.value)}
                placeholder="https://maps.google.com/?q=26.35,43.98" />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">الوصف</label>
              <textarea className="input w-full resize-none" rows={3} value={form.description_ar}
                onChange={(e) => set('description_ar', e.target.value)}
                placeholder="وصف العقار..." />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                المميزات <span className="text-xs font-normal text-gray-400">(مطبخ راكب، تكييف مركزي، قريب من مدرسة...)</span>
              </label>
              {form.features.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {form.features.map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2.5 py-1 rounded-full">
                      {f}
                      <button type="button" onClick={() => removeFeature(i)} className="hover:text-blue-900">
                        <XMarkIcon className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input className="input flex-1 text-sm" value={newFeature}
                  onChange={(e) => setNewFeature(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addFeature())}
                  placeholder="أضف ميزة واضغط إدخال..." />
                <button type="button" onClick={addFeature} className="btn-secondary px-4 text-sm whitespace-nowrap">
                  + إضافة
                </button>
              </div>
            </div>

            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={form.is_featured}
                  onChange={(e) => set('is_featured', e.target.checked)}
                  className="w-4 h-4 rounded accent-blue-600" />
                <span className="text-sm font-medium text-gray-700">عقار مميز ⭐</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={form.negotiable}
                  onChange={(e) => set('negotiable', e.target.checked)}
                  className="w-4 h-4 rounded accent-blue-600" />
                <span className="text-sm font-medium text-gray-700">قابل للتفاوض</span>
              </label>
            </div>
          </div>

          <div className="flex gap-3 pt-2 border-t">
            <button type="submit" disabled={isPending} className="btn-primary flex-1 justify-center">
              {isPending ? 'جاري الحفظ...' : isEdit ? 'حفظ التعديلات' : 'إضافة العقار'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary px-6">إلغاء</button>
          </div>

          {isEdit && (
            <div className="pt-2">
              <button type="button"
                disabled={deleteMut.isPending}
                onClick={() => {
                  if (window.confirm('حذف هذا العقار نهائياً؟ لا يمكن التراجع.')) deleteMut.mutate();
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-red-600 border border-red-200 rounded-xl hover:bg-red-50 disabled:opacity-50 transition-colors">
                <TrashIcon className="w-4 h-4" />
                {deleteMut.isPending ? 'جاري الحذف...' : 'حذف العقار نهائياً'}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

// ─── Property Card ────────────────────────────────────────────────────────────
function PropertyCard({ property, onEdit }: { property: any; onEdit: () => void }) {
  const status = statusConfig[property.status] ?? { label: property.status, color: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200', dot: 'bg-gray-400' };
  const typeLabel = propertyTypeLabels[property.property_type ?? property.type] ?? '';
  const purposeLabel = purposeLabels[property.purpose] ?? '';

  return (
    <div className="card !p-0 overflow-hidden group hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
      {/* Image */}
      <div className="relative h-48 bg-gray-100 overflow-hidden">
        {property.main_image_url ? (
          <img src={property.main_image_url} alt={property.title_ar ?? property.title}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-300 bg-gradient-to-br from-gray-50 to-gray-100">
            <PhotoIcon className="w-10 h-10 mb-1.5" />
            <span className="text-xs">لا توجد صورة</span>
          </div>
        )}

        {/* Status badge */}
        <div className="absolute top-3 right-3">
          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${status.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>
        </div>

        {/* Featured */}
        {property.is_featured && (
          <div className="absolute top-3 left-3">
            <StarSolid className="w-5 h-5 text-amber-400 drop-shadow" />
          </div>
        )}

        {/* Code */}
        {property.code && (
          <div className="absolute bottom-3 right-3 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-md font-mono backdrop-blur-sm">
            {property.code}
          </div>
        )}

        {/* Edit overlay */}
        <button onClick={onEdit}
          className="absolute bottom-3 left-3 bg-white/95 text-gray-700 hover:bg-blue-600 hover:text-white p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all shadow-md">
          <PencilSquareIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-bold text-gray-900 truncate leading-snug">
          {property.title_ar ?? property.title}
        </h3>

        <div className="flex items-center gap-1.5 text-gray-500 text-xs mt-1.5">
          <MapPinIcon className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
          <span className="truncate">
            {[property.district_name, property.city_name].filter(Boolean).join(' - ') || property.address || 'غير محدد'}
          </span>
        </div>

        {/* Specs row */}
        <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
          {typeLabel && <span className="bg-gray-100 px-2 py-0.5 rounded-md font-medium">{typeLabel}</span>}
          {purposeLabel && <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md font-medium">{purposeLabel}</span>}
          {(property.area_sqm || property.area) && (
            <span>{Number(property.area_sqm || property.area).toLocaleString('ar-SA')} م²</span>
          )}
          {property.rooms && <span>{property.rooms} غرف</span>}
        </div>

        {/* Price & Edit */}
        <div className="flex items-end justify-between mt-3 pt-3 border-t border-gray-50">
          <div>
            {property.price ? (
              <>
                <span className="text-xl font-bold text-blue-700">
                  {Number(property.price).toLocaleString('ar-SA')}
                </span>
                <span className="text-xs text-gray-400 mr-1">ر.س</span>
                {property.negotiable && <span className="text-[10px] text-gray-400 block">قابل للتفاوض</span>}
              </>
            ) : (
              <span className="text-sm text-gray-400">السعر عند الطلب</span>
            )}
          </div>
          <button onClick={onEdit}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 transition-colors py-1">
            <PencilSquareIcon className="w-3.5 h-3.5" />
            تعديل
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PropertiesPage() {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ property_type: '', status: '', city_id: '', purpose: '' });
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<{ open: boolean; property?: any }>({ open: false });
  const [showFilters, setShowFilters] = useState(false);

  const { data: citiesRes } = useQuery({ queryKey: ['cities'], queryFn: propertiesApi.cities });

  const { data, isLoading } = useQuery({
    queryKey: ['properties', filters, page, search],
    queryFn: () => propertiesApi.search({
      ...(filters.property_type ? { property_type: filters.property_type } : {}),
      ...(filters.city_id       ? { city_id: filters.city_id }             : {}),
      ...(filters.status        ? { status: filters.status }               : {}),
      ...(filters.purpose       ? { purpose: filters.purpose }             : {}),
      page, limit: 12,
      search: search || undefined,
    }),
    placeholderData: (prev: any) => prev,
  });

  const properties = (data as any)?.data?.data ?? [];
  const pagination = (data as any)?.data?.pagination;

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="space-y-6">
      {modal.open && (
        <PropertyModal property={modal.property} onClose={() => setModal({ open: false })} />
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="page-title">إدارة العقارات</h2>
          <p className="page-sub mt-1">
            {pagination?.total != null ? `${pagination.total.toLocaleString('ar-SA')} عقار` : 'جاري التحميل...'}
          </p>
        </div>
        <button className="btn-primary" onClick={() => setModal({ open: true })}>
          <PlusIcon className="w-4 h-4" />
          إضافة عقار
        </button>
      </div>

      {/* Search + Filters */}
      <div className="card !p-4 space-y-3">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="بحث عن عقار بالعنوان أو الكود..."
              className="input pr-9 w-full" />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
              showFilters || activeFilterCount > 0
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>
            <FunnelIcon className="w-4 h-4" />
            فلترة
            {activeFilterCount > 0 && (
              <span className="bg-blue-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t">
            <select value={filters.property_type}
              onChange={(e) => { setFilters((f) => ({ ...f, property_type: e.target.value })); setPage(1); }}
              className="input">
              <option value="">جميع الأنواع</option>
              {Object.entries(propertyTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={filters.status}
              onChange={(e) => { setFilters((f) => ({ ...f, status: e.target.value })); setPage(1); }}
              className="input">
              <option value="">جميع الحالات</option>
              {Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={filters.purpose}
              onChange={(e) => { setFilters((f) => ({ ...f, purpose: e.target.value })); setPage(1); }}
              className="input">
              <option value="">البيع والإيجار</option>
              {Object.entries(purposeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={filters.city_id}
              onChange={(e) => { setFilters((f) => ({ ...f, city_id: e.target.value })); setPage(1); }}
              className="input">
              <option value="">جميع المدن</option>
              {((citiesRes as any)?.data?.data ?? []).map((c: any) => (
                <option key={c.id} value={c.id}>{c.name_ar}</option>
              ))}
            </select>

            {activeFilterCount > 0 && (
              <button
                onClick={() => { setFilters({ property_type: '', status: '', city_id: '', purpose: '' }); setPage(1); }}
                className="text-xs text-red-500 hover:text-red-700 col-span-full text-right underline">
                مسح جميع الفلاتر
              </button>
            )}
          </div>
        )}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card !p-0 overflow-hidden animate-pulse">
              <div className="w-full h-48 bg-gray-200" />
              <div className="p-4 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-3 bg-gray-200 rounded w-1/2" />
                <div className="h-6 bg-gray-200 rounded w-1/3 mt-4" />
              </div>
            </div>
          ))}
        </div>
      ) : properties.length === 0 ? (
        <div className="card text-center py-16">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <HomeIcon className="w-8 h-8 text-gray-400" />
          </div>
          <p className="font-semibold text-gray-700">لا توجد عقارات</p>
          <p className="text-sm text-gray-400 mt-1">
            {search || activeFilterCount > 0 ? 'جرب تعديل الفلاتر أو مسح البحث' : 'ابدأ بإضافة أول عقار'}
          </p>
          {!search && !activeFilterCount && (
            <button className="btn-primary mt-5" onClick={() => setModal({ open: true })}>
              <PlusIcon className="w-4 h-4" /> إضافة أول عقار
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {properties.map((prop: any) => (
            <PropertyCard key={prop.id} property={prop}
              onEdit={() => setModal({ open: true, property: prop })} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.total_pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage((p) => p - 1)} disabled={page === 1}
            className="btn-secondary disabled:opacity-40">السابق</button>
          <span className="text-sm text-gray-600 px-4 py-2 bg-gray-50 rounded-lg">
            صفحة {page} من {pagination.total_pages}
          </span>
          <button onClick={() => setPage((p) => p + 1)} disabled={page >= pagination.total_pages}
            className="btn-secondary disabled:opacity-40">التالي</button>
        </div>
      )}
    </div>
  );
}