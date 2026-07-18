import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../services/api.ts';
import toast from 'react-hot-toast';

export default function GoogleSheetsPage() {
  const [sheetUrl, setSheetUrl] = useState('');
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [uploadType, setUploadType] = useState<'properties' | 'clients'>('properties');
  const fileRef = useRef<HTMLInputElement>(null);

  const exportProps = useMutation({
    mutationFn: () => api.post('/sheets/export-properties', { sheetUrl }),
    onSuccess: (r: any) => {
      const csv = r.data?.data?.csv ?? '';
      if (csv) {
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'properties.csv'; a.click();
        URL.revokeObjectURL(url);
      }
      toast.success(r.data?.message ?? 'تم التصدير');
      setLastSync(new Date().toLocaleTimeString('ar-SA'));
    },
    onError: () => toast.error('فشل التصدير'),
  });

  const exportClients = useMutation({
    mutationFn: () => api.post('/sheets/export-clients', {}),
    onSuccess: (r: any) => {
      const csv = r.data?.data?.csv ?? '';
      if (csv) {
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'clients.csv'; a.click();
        URL.revokeObjectURL(url);
      }
      toast.success(r.data?.message ?? 'تم تصدير العملاء');
      setLastSync(new Date().toLocaleTimeString('ar-SA'));
    },
    onError: () => toast.error('فشل التصدير'),
  });

  const uploadExcel = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', uploadType);
      return api.post('/sheets/upload-excel', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: (r: any) => {
      toast.success(r.data?.message ?? 'تم الاستيراد');
      setLastSync(new Date().toLocaleTimeString('ar-SA'));
      if (fileRef.current) fileRef.current.value = '';
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'فشل الاستيراد'),
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadExcel.mutate(file);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">البيانات والتصدير</h2>
        <p className="text-sm text-gray-500 mt-1">استيراد وتصدير البيانات — Excel وCSV</p>
      </div>

      {/* Excel Upload */}
      <div className="card space-y-4">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
          <span className="text-green-600 text-lg">📊</span>
          رفع ملف Excel
        </h3>

        <div className="flex gap-3">
          <button onClick={() => setUploadType('properties')} className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${uploadType==='properties' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            🏠 عقارات
          </button>
          <button onClick={() => setUploadType('clients')} className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${uploadType==='clients' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            👥 عملاء
          </button>
        </div>

        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-2xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all"
        >
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
          {uploadExcel.isPending ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-blue-600">جاري الاستيراد…</p>
            </div>
          ) : (
            <>
              <div className="text-4xl mb-3">📁</div>
              <p className="font-medium text-gray-700">اضغط لرفع ملف Excel أو CSV</p>
              <p className="text-xs text-gray-400 mt-1">.xlsx / .xls / .csv — حجم أقصى 10MB</p>
            </>
          )}
        </div>

        {/* Template info */}
        <div className="bg-gray-50 rounded-xl p-4 text-sm space-y-2">
          <p className="font-medium text-gray-700">أعمدة ملف {uploadType === 'properties' ? 'العقارات' : 'العملاء'}:</p>
          {uploadType === 'properties' ? (
            <p className="text-gray-500 font-mono text-xs">العنوان | النوع | السعر | المساحة | الغرف | الحمامات | الحالة | الوصف</p>
          ) : (
            <p className="text-gray-500 font-mono text-xs">الاسم | الجوال | البريد | الميزانية | الغرض | ملخص</p>
          )}
        </div>
      </div>

      {/* Export */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card space-y-3">
          <h3 className="font-semibold text-gray-800">⬆️ تصدير العقارات</h3>
          <p className="text-sm text-gray-500">تنزيل جميع العقارات كملف CSV يمكن فتحه في Excel</p>
          <button onClick={() => exportProps.mutate()} disabled={exportProps.isPending} className="btn-primary w-full disabled:opacity-50">
            {exportProps.isPending ? 'جاري التصدير…' : 'تنزيل ملف العقارات'}
          </button>
        </div>

        <div className="card space-y-3">
          <h3 className="font-semibold text-gray-800">👥 تصدير العملاء</h3>
          <p className="text-sm text-gray-500">تنزيل قائمة العملاء مع ملخص طلب كل عميل</p>
          <button onClick={() => exportClients.mutate()} disabled={exportClients.isPending} className="w-full px-4 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50">
            {exportClients.isPending ? 'جاري التصدير…' : 'تنزيل ملف العملاء'}
          </button>
        </div>
      </div>

      {lastSync && <p className="text-xs text-gray-400 text-center">آخر عملية: {lastSync}</p>}
    </div>
  );
}