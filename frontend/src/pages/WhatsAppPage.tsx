import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api.ts';
import toast from 'react-hot-toast';

const INSTANCES = [
  { id: 'naqidan-whatsapp-1', label: 'الرقم الأول', color: 'blue' },
  { id: 'naqidan-whatsapp-2', label: 'الرقم الثاني', color: 'purple' },
  { id: 'naqidan-whatsapp-3', label: 'الرقم الثالث', color: 'emerald' },
];

type Status = 'disconnected' | 'connecting' | 'connected';

function InstanceCard({ instance, index }: { instance: typeof INSTANCES[0]; index: number }) {
  const qc = useQueryClient();
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('disconnected');
  const [phone, setPhone] = useState<string | null>(null);
  const [connectedAt, setConnectedAt] = useState<Date | null>(null);
  const prevStatus = useRef<Status>('disconnected');

  const { data: statusData } = useQuery({
    queryKey: ['wa-status', instance.id],
    queryFn: () => api.get(`/whatsapp/status/${instance.id}`),
    refetchInterval: status === 'connecting' ? 3000 : 15000,
    retry: false,
    throwOnError: false,
  });

  useEffect(() => {
    if (!statusData) return;
    const raw = (statusData as any).data?.data;
    const state: string = raw?.state ?? raw?.instance?.state ?? 'close';
    const newStatus: Status = state === 'open' ? 'connected' : state === 'connecting' ? 'connecting' : 'disconnected';

    if (newStatus === 'connected' && prevStatus.current !== 'connected') {
      setQr(null);
      setConnectedAt(new Date());
      const num = raw?.instance?.owner ?? raw?.instance?.profileName ?? null;
      if (num) setPhone(num.replace('@s.whatsapp.net', ''));
      toast.success(`${instance.label} متصل!`, { icon: '✅' });
    }
    if (newStatus === 'disconnected' && prevStatus.current === 'connected') {
      setPhone(null);
      setConnectedAt(null);
    }

    prevStatus.current = newStatus;
    setStatus(newStatus);
  }, [statusData, instance.label]);

  const connect = useMutation({
    mutationFn: () => api.post(`/whatsapp/connect/${instance.id}`),
    onSuccess: (r: any) => {
      const b64 = r.data?.data?.base64;
      if (b64) {
        setQr(b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`);
        setStatus('connecting');
      } else {
        toast('لم يظهر الباركود — حاول مرة أخرى بعد لحظة', { icon: '⏳' });
      }
    },
    onError: () => {
      toast('خدمة واتساب غير متاحة حالياً — تأكد من تشغيل الخادم أو تواصل مع الدعم', { icon: '⚠️' });
    },
  });

  const disconnect = useMutation({
    mutationFn: () => api.delete(`/whatsapp/disconnect/${instance.id}`),
    onSuccess: () => {
      setStatus('disconnected');
      setQr(null);
      setPhone(null);
      setConnectedAt(null);
      qc.invalidateQueries({ queryKey: ['wa-status', instance.id] });
      toast.success('تم قطع الاتصال');
    },
    onError: () => {
      // Still reset UI even if server didn't respond
      setStatus('disconnected');
      setQr(null);
      setPhone(null);
      setConnectedAt(null);
    },
  });

  const refreshQr = async () => {
    const r: any = await api.get(`/whatsapp/qr/${instance.id}`).catch(() => null);
    const b64 = r?.data?.data?.base64;
    if (b64) setQr(b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`);
    else toast.error('الباركود غير متاح، اضغط ربط الرقم');
  };

  const colors: Record<string, string> = {
    blue: 'from-blue-500 to-blue-600',
    purple: 'from-purple-500 to-purple-600',
    emerald: 'from-emerald-500 to-emerald-600',
  };

  return (
    <div className={`rounded-2xl border bg-white shadow-sm flex flex-col overflow-hidden transition-all duration-300 ${status === 'connected' ? 'border-green-200 shadow-green-50' : 'border-gray-200'}`}>
      {/* Header bar */}
      <div className={`bg-gradient-to-l ${colors[instance.color]} p-4 flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
            </svg>
          </div>
          <div>
            <p className="font-bold text-white text-sm">{instance.label}</p>
            <p className="text-white/70 text-xs">{instance.id}</p>
          </div>
        </div>
        {/* Status badge */}
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
          status === 'connected' ? 'bg-white/20 text-white' :
          status === 'connecting' ? 'bg-yellow-400/30 text-white' :
          'bg-black/20 text-white/80'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${
            status === 'connected' ? 'bg-green-300' :
            status === 'connecting' ? 'bg-yellow-300 animate-pulse' :
            'bg-white/50'
          }`} />
          {status === 'connected' ? 'متصل' : status === 'connecting' ? 'جاري الربط…' : 'غير متصل'}
        </div>
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col gap-4 flex-1">

        {/* Connected state */}
        {status === 'connected' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-xl p-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-green-800">متصل ويستقبل الرسائل</p>
                {phone && <p className="text-xs text-green-600 mt-0.5 font-mono" dir="ltr">+{phone}</p>}
                {connectedAt && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    منذ {connectedAt.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
              className="w-full py-2 text-sm text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl transition-colors border border-transparent hover:border-red-100 disabled:opacity-50"
            >
              {disconnect.isPending ? 'جاري الفصل…' : 'قطع الاتصال'}
            </button>
          </div>
        )}

        {/* QR code */}
        {status === 'connecting' && qr && (
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl bg-green-400/10 animate-ping" />
              <div className="relative p-3 border-2 border-green-300 rounded-2xl bg-white shadow-sm">
                <img src={qr} alt="QR Code" className="w-48 h-48 rounded" />
              </div>
            </div>
            <div className="text-center space-y-1">
              <p className="text-xs font-medium text-gray-700">افتح واتساب على هاتفك</p>
              <p className="text-xs text-gray-500">الأجهزة المرتبطة ← ربط جهاز ← امسح الكود</p>
            </div>
            <button onClick={refreshQr} className="text-xs text-blue-500 hover:text-blue-700 hover:underline transition-colors">
              🔄 تحديث الباركود
            </button>
          </div>
        )}

        {/* Connecting without QR */}
        {status === 'connecting' && !qr && (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-10 h-10 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500">جاري توليد الباركود…</p>
          </div>
        )}

        {/* Disconnected */}
        {status === 'disconnected' && (
          <div className="flex flex-col items-center gap-4 py-3">
            <div className="w-16 h-16 bg-gray-50 border-2 border-dashed border-gray-200 rounded-full flex items-center justify-center">
              <svg className="w-7 h-7 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-600">لم يتم الربط بعد</p>
              <p className="text-xs text-gray-400 mt-1">اضغط الزر أدناه لبدء ربط واتساب</p>
            </div>
            <button
              onClick={() => connect.mutate()}
              disabled={connect.isPending}
              className="w-full py-2.5 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2 shadow-sm"
            >
              {connect.isPending ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  جاري التهيئة…
                </>
              ) : (
                <>📱 ربط واتساب</>
              )}
            </button>
          </div>
        )}
              disabled={connect.isPending}
              className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {connect.isPending ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  جاري الاتصال…
                </>
              ) : (
                <>📱 ربط الرقم</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function WhatsAppPage() {
  const connectedCount = 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">إدارة واتساب</h2>
          <p className="text-sm text-gray-500 mt-1">ربط أرقام واتساب بنظام الذكاء الاصطناعي</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {INSTANCES.map((inst, i) => (
          <InstanceCard key={inst.id} instance={inst} index={i} />
        ))}
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5">
        <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
          <span>ℹ️</span> كيف يعمل النظام؟
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {[
            'كل رقم يستقبل الرسائل ويرد تلقائياً بالذكاء الاصطناعي',
            'المحادثات تظهر في صفحة المحادثات مع إمكانية التدخل اليدوي',
            'يمكن تعطيل الذكاء الاصطناعي لأي محادثة بضغطة زر',
            'العملاء الجدد يُضافون تلقائياً في قاعدة البيانات',
          ].map((t, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-blue-800">
              <span className="text-blue-400 mt-0.5 flex-shrink-0">✓</span>
              <span>{t}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}