import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChatBubbleLeftRightIcon, PaperAirplaneIcon, CpuChipIcon,
  MagnifyingGlassIcon, UserIcon, BoltIcon,
  XMarkIcon, TrashIcon, ArrowRightIcon,
} from '@heroicons/react/24/outline';
import { CpuChipIcon as CpuSolid } from '@heroicons/react/24/solid';
import { conversationsApi, clientsApi } from '../services/api.ts';
import toast from 'react-hot-toast';
import { format, formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';

/* ── Quick replies ───────────────────────────────────────────────────────── */
const QUICK_REPLIES = [
  { label: 'ترحيب',       text: 'أهلاً وسهلاً 👋 كيف يمكنني مساعدتك اليوم؟' },
  { label: 'موعد معاينة', text: 'بكل سرور! هل تفضل المعاينة صباحاً أم مساءً؟ 📅' },
  { label: 'انتظار موظف', text: 'سيتواصل معك أحد مستشارينا قريباً إن شاء الله 🤝' },
  { label: 'الميزانية',   text: 'ما هي ميزانيتك التقريبية؟ 💰' },
  { label: 'الحي',        text: 'ما هو الحي أو المنطقة المفضلة لديك؟ 📍' },
  { label: 'الغرض',       text: 'هل تبحث للشراء أم الإيجار؟' },
  { label: 'عدد الغرف',   text: 'كم عدد الغرف التي تحتاجها؟ 🛏' },
  { label: 'شكر',         text: 'شكراً لتواصلك مع مكتب النقيدان 🏡 نسعد بخدمتك دائماً.' },
];

/* ── Status config ───────────────────────────────────────────────────────── */
const STATUS_CFG: Record<string, { label: string; bg: string; color: string; border: string }> = {
  new:               { label: 'جديد',        bg: 'rgba(59,91,219,0.08)',   color: '#3B5BDB', border: 'rgba(59,91,219,0.2)'  },
  contacted:         { label: 'تم التواصل',  bg: 'rgba(99,102,241,0.08)', color: '#6366F1', border: 'rgba(99,102,241,0.2)' },
  interested:        { label: 'مهتم',        bg: 'rgba(245,158,11,0.1)',  color: '#D97706', border: 'rgba(245,158,11,0.2)' },
  viewing_scheduled: { label: 'موعد معاينة', bg: 'rgba(249,115,22,0.08)', color: '#EA580C', border: 'rgba(249,115,22,0.2)' },
  negotiating:       { label: 'تفاوض',       bg: 'rgba(124,58,237,0.08)', color: '#7C3AED', border: 'rgba(124,58,237,0.2)' },
  closed_won:        { label: 'مكتمل ✓',     bg: 'rgba(5,150,105,0.08)',  color: '#059669', border: 'rgba(5,150,105,0.2)'  },
  closed_lost:       { label: 'خسارة',       bg: 'rgba(239,68,68,0.08)',  color: '#DC2626', border: 'rgba(239,68,68,0.2)'  },
  follow_up:         { label: 'متابعة',      bg: 'rgba(6,182,212,0.08)',  color: '#0891B2', border: 'rgba(6,182,212,0.2)'  },
};
const STATUS_OPTIONS = Object.entries(STATUS_CFG).map(([k, v]) => ({ value: k, label: v.label }));

/* ── Avatar gradient ─────────────────────────────────────────────────────── */
const GRADS = [
  'linear-gradient(135deg,#3B5BDB,#5273F5)',
  'linear-gradient(135deg,#7C3AED,#9B5CF6)',
  'linear-gradient(135deg,#059669,#34D399)',
  'linear-gradient(135deg,#A8892E,#C8A84B)',
  'linear-gradient(135deg,#EA580C,#FB923C)',
];
const grad = (s: string) => GRADS[s.charCodeAt(0) % GRADS.length]!;

/* ── Delete Dialog ───────────────────────────────────────────────────────── */
function DeleteDialog({ name, onConfirm, onCancel, pending }: {
  name: string; onConfirm: () => void; onCancel: () => void; pending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(6,12,24,0.65)', backdropFilter: 'blur(6px)' }}>
      <div className="w-full max-w-sm text-center p-8"
        style={{ background: '#fff', borderRadius: '20px', boxShadow: '0 24px 64px rgba(6,12,24,0.25)' }}>
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
          <TrashIcon className="w-7 h-7" style={{ color: '#DC2626' }} />
        </div>
        <h3 className="font-bold text-lg mb-2" style={{ color: '#0F1C35' }}>حذف المحادثة؟</h3>
        <p className="text-sm mb-1" style={{ color: '#5A6882' }}>
          سيتم حذف محادثة <strong style={{ color: '#0F1C35' }}>{name}</strong> بشكل نهائي
        </p>
        <p className="text-xs mb-7" style={{ color: '#94A3B8' }}>لا يمكن التراجع عن هذا الإجراء</p>
        <div className="flex gap-3 justify-center">
          <button onClick={onCancel}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{ color: '#5A6882' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,91,219,0.05)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            إلغاء
          </button>
          <button onClick={onConfirm} disabled={pending}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg,#DC2626,#EF4444)', boxShadow: '0 2px 8px rgba(239,68,68,0.3)' }}>
            {pending && <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
            حذف نهائياً
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Conversation List Item ──────────────────────────────────────────────── */
function ConvItem({ conv, isSelected, onClick }: { conv: any; isSelected: boolean; onClick: () => void }) {
  const hasUnread = conv.unread_count > 0;
  const isAI = conv.is_ai_enabled;
  const name = conv.full_name ?? conv.phone ?? '?';
  const sc = STATUS_CFG[conv.status];
  return (
    <button onClick={onClick} className="w-full px-3 py-3 text-right transition-all border-b"
      style={{
        background: isSelected ? '#fff' : 'transparent',
        borderColor: 'rgba(59,91,219,0.06)',
        boxShadow: isSelected ? '0 1px 4px rgba(6,12,24,0.06)' : 'none',
      }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(59,91,219,0.02)'; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}>
      <div className="flex items-start gap-2.5">
        <div className="relative w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm text-white"
          style={{ background: grad(name) }}>
          {name.charAt(0)}
          <span className="absolute -bottom-0.5 -left-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center border-2 border-white"
            style={{ background: isAI ? '#3B5BDB' : '#059669' }}>
            {isAI
              ? <CpuChipIcon className="w-2 h-2 text-white" />
              : <UserIcon className="w-2 h-2 text-white" />}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <p className="text-sm truncate" style={{ color: '#0F1C35', fontWeight: hasUnread ? 700 : 500 }}>
              {name}
            </p>
            <span className="text-[10px] flex-shrink-0" style={{ color: '#94A3B8' }}>
              {conv.last_message_at ? formatDistanceToNow(new Date(conv.last_message_at), { locale: ar, addSuffix: false }) : ''}
            </span>
          </div>
          <div className="flex items-center justify-between gap-1">
            <p className="text-xs truncate flex-1" style={{ color: '#7A8FAA' }}>
              {conv.last_message ?? conv.phone}
            </p>
            <div className="flex items-center gap-1 flex-shrink-0">
              {sc && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>}
              {hasUnread && (
                <span className="w-5 h-5 text-[10px] font-bold rounded-full flex items-center justify-center text-white"
                  style={{ background: '#059669' }}>
                  {conv.unread_count > 9 ? '9+' : conv.unread_count}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </button>
  );
}

/* ── Message Bubble ──────────────────────────────────────────────────────── */
function MessageBubble({ msg }: { msg: any }) {
  const isOut = msg.direction === 'outbound';
  const isAI  = msg.is_from_ai;
  return (
    <div className={`flex ${isOut ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[80%] sm:max-w-[72%] flex flex-col ${isOut ? 'items-start' : 'items-end'}`}>
        {isOut && (
          <span className="text-[10px] mb-1 font-semibold" style={{ color: isAI ? '#3B5BDB' : '#059669' }}>
            {isAI ? '🤖 ذكاء اصطناعي' : '👤 موظف'}
          </span>
        )}
        <div className="px-3 py-2 sm:px-4 sm:py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
          style={{
            background: isOut
              ? isAI ? 'linear-gradient(135deg,#3B5BDB,#5273F5)' : 'linear-gradient(135deg,#059669,#34D399)'
              : '#fff',
            color: isOut ? '#fff' : '#0F1C35',
            borderRadius: isOut ? '16px 16px 16px 4px' : '16px 16px 4px 16px',
            boxShadow: isOut ? '0 2px 8px rgba(59,91,219,0.25)' : '0 1px 4px rgba(6,12,24,0.08)',
            border: isOut ? 'none' : '1px solid rgba(59,91,219,0.08)',
          }}>
          {msg.content ?? `[${msg.message_type ?? 'رسالة'}]`}
        </div>
        <span className="text-[10px] mt-1 px-1" style={{ color: '#94A3B8' }}>
          {format(new Date(msg.created_at), 'HH:mm')}
        </span>
      </div>
    </div>
  );
}

/* ── Client Panel ────────────────────────────────────────────────────────── */
function ClientPanel({ conv, onClose }: { conv: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [editStatus, setEditStatus] = useState(false);
  const [newNote, setNewNote] = useState('');

  const updateStatus = useMutation({
    mutationFn: (status: string) => clientsApi.update(conv.client_id ?? conv.id, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['conversations'] }); setEditStatus(false); toast.success('تم تحديث الحالة'); },
  });
  const addNote = useMutation({
    mutationFn: () => clientsApi.addNote(conv.client_id ?? conv.id, { content: newNote }),
    onSuccess: () => { setNewNote(''); toast.success('تمت إضافة الملاحظة'); },
  });

  const sc = STATUS_CFG[conv.status];
  const name = conv.full_name ?? conv.phone ?? '?';

  return (
    <div className="w-56 sm:w-64 flex-shrink-0 flex flex-col overflow-hidden"
      style={{ borderRight: '1px solid rgba(59,91,219,0.08)', background: 'rgba(242,246,255,0.5)' }}>
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(59,91,219,0.07)', background: '#fff' }}>
        <span className="text-xs font-bold tracking-widest uppercase" style={{ color: '#7A8FAA' }}>بيانات العميل</span>
        <button onClick={onClose} className="p-1.5 rounded-lg"
          style={{ color: '#94A3B8' }}>
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex flex-col items-center text-center py-2">
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold mb-2"
            style={{ background: grad(name) }}>{name.charAt(0)}</div>
          <p className="font-bold text-sm" style={{ color: '#0F1C35' }}>{conv.full_name ?? '—'}</p>
          {conv.phone && <a href={`tel:${conv.phone}`} className="text-xs mt-0.5 font-mono" style={{ color: '#3B5BDB' }} dir="ltr">{conv.phone}</a>}
        </div>
        <div className="rounded-xl p-3" style={{ background: '#fff', border: '1px solid rgba(59,91,219,0.08)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold" style={{ color: '#5A6882' }}>حالة العميل</span>
            <button onClick={() => setEditStatus(!editStatus)} className="text-[10px] font-semibold" style={{ color: '#3B5BDB' }}>
              {editStatus ? 'إلغاء' : 'تغيير'}
            </button>
          </div>
          {editStatus ? (
            <select className="input w-full text-xs" defaultValue={conv.status}
              onChange={(e) => updateStatus.mutate(e.target.value)}>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : sc ? (
            <span className="text-xs px-2.5 py-1 rounded-full font-semibold"
              style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
              {sc.label}
            </span>
          ) : null}
        </div>
        {[
          conv.budget_max && { label: 'الميزانية', value: `${Number(conv.budget_max).toLocaleString('ar-SA')} ر.س` },
          conv.last_message_at && { label: 'آخر تواصل', value: formatDistanceToNow(new Date(conv.last_message_at), { locale: ar, addSuffix: true }) },
          conv.special_requirements && { label: 'متطلبات', value: conv.special_requirements },
        ].filter(Boolean).map((item: any) => (
          <div key={item.label} className="rounded-xl p-3" style={{ background: '#fff', border: '1px solid rgba(59,91,219,0.08)' }}>
            <p className="text-[10px] font-bold mb-1 uppercase tracking-wide" style={{ color: '#7A8FAA' }}>{item.label}</p>
            <p className="text-xs font-semibold" style={{ color: '#0F1C35' }}>{item.value}</p>
          </div>
        ))}
        <div>
          <p className="text-xs font-bold mb-2" style={{ color: '#5A6882' }}>إضافة ملاحظة</p>
          <textarea rows={2} className="input w-full text-xs resize-none" value={newNote}
            onChange={(e) => setNewNote(e.target.value)} placeholder="ملاحظة على العميل..." />
          <button onClick={() => addNote.mutate()} disabled={!newNote.trim() || addNote.isPending}
            className="mt-2 w-full py-2 text-xs font-bold text-white rounded-xl disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg,#3B5BDB,#5273F5)' }}>
            {addNote.isPending ? 'جاري الحفظ...' : 'حفظ الملاحظة'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────────────── */
type Filter = 'all' | 'ai' | 'manual' | 'unread';

export default function ConversationsPage() {
  const [selectedConv, setSelectedConv] = useState<any>(null);
  const [message, setMessage]           = useState('');
  const [search, setSearch]             = useState('');
  const [filter, setFilter]             = useState<Filter>('all');
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showClientPanel, setShowClientPanel]   = useState(false);
  const [confirmDelete, setConfirmDelete]       = useState(false);
  const [isMobile, setIsMobile]                 = useState(false);
  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const qc = useQueryClient();

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const { data: convsRes } = useQuery({
    queryKey: ['conversations'],
    queryFn:  conversationsApi.list,
    refetchInterval: 6000,
  });
  const { data: msgsRes } = useQuery({
    queryKey: ['messages', selectedConv?.id],
    queryFn:  () => selectedConv ? conversationsApi.messages(selectedConv.id) : Promise.resolve(null),
    enabled:  !!selectedConv,
    refetchInterval: 4000,
  });

  const sendMut = useMutation({
    mutationFn: (text: string) => conversationsApi.send(selectedConv.id, text),
    onSuccess: (res: any) => {
      setMessage(''); setShowQuickReplies(false);
      // "11" is a takeover command, not a message — the backend stops the bot
      // and sends nothing to the customer, so reflect that in the UI.
      if (res?.data?.data?.command === 'takeover') {
        toast.success('تم إيقاف البوت — أنت الآن تتولى المحادثة');
        setSelectedConv((p: any) => p ? { ...p, is_ai_enabled: false } : p);
      }
      qc.invalidateQueries({ queryKey: ['messages', selectedConv.id] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: () => toast.error('فشل إرسال الرسالة'),
  });

  const toggleAI = useMutation({
    mutationFn: () => conversationsApi.toggleAI(selectedConv.id),
    onSuccess: (res) => {
      const enabled = (res as any).data.data.is_ai_enabled;
      toast.success(enabled ? '🤖 تم تفعيل الذكاء الاصطناعي' : '👤 أنت الآن في التحكم');
      qc.invalidateQueries({ queryKey: ['conversations'] });
      setSelectedConv((p: any) => p ? { ...p, is_ai_enabled: enabled } : p);
    },
  });

  const deleteConv = useMutation({
    mutationFn: () => conversationsApi.remove(selectedConv.id),
    onSuccess: () => {
      toast.success('تم حذف المحادثة');
      setSelectedConv(null); setConfirmDelete(false);
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: () => toast.error('تعذّر حذف المحادثة'),
  });

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgsRes]);
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [message]);

  const allConvs: any[] = (convsRes as any)?.data?.data ?? [];
  const messages: any[] = (msgsRes as any)?.data?.data  ?? [];

  const filtered = allConvs.filter((c: any) => {
    const matchSearch = !search || (c.full_name ?? '').includes(search) || (c.phone ?? '').includes(search);
    const matchFilter = filter === 'all' || (filter === 'ai' && c.is_ai_enabled) ||
      (filter === 'manual' && !c.is_ai_enabled) || (filter === 'unread' && c.unread_count > 0);
    return matchSearch && matchFilter;
  });

  const counts = {
    all:    allConvs.length,
    ai:     allConvs.filter(c => c.is_ai_enabled).length,
    manual: allConvs.filter(c => !c.is_ai_enabled).length,
    unread: allConvs.filter(c => c.unread_count > 0).length,
  };

  const handleSend = () => {
    const text = message.trim();
    if (!text || !selectedConv) return;
    sendMut.mutate(text);
  };

  const handleSelectConv = (conv: any) => {
    setSelectedConv(conv);
    setShowClientPanel(false);
  };

  const handleBack = () => {
    setSelectedConv(null);
    setShowClientPanel(false);
  };

  const selectedName = selectedConv ? (selectedConv.full_name ?? selectedConv.phone ?? '?') : '';

  // On mobile: show list OR chat (not both). On desktop: show both side by side.
  const showList = !isMobile || !selectedConv;
  const showChat = !isMobile || !!selectedConv;

  return (
    <div className="flex overflow-hidden"
      style={{
        height: isMobile ? 'calc(100dvh - 4rem)' : 'calc(100vh - 9rem)',
        borderRadius: isMobile ? 0 : '16px',
        border: isMobile ? 'none' : '1px solid rgba(59,91,219,0.1)',
        background: '#fff',
        boxShadow: isMobile ? 'none' : '0 2px 12px rgba(6,12,24,0.07)',
      }}>

      {/* ── Conversation List ──────────────────────────────────────────── */}
      {showList && (
        <div
          className="flex flex-col"
          style={{
            width: isMobile ? '100%' : '18rem',
            flexShrink: 0,
            borderLeft: '1px solid rgba(59,91,219,0.08)',
            background: 'rgba(242,246,255,0.4)',
          }}>

          <div className="px-3 pt-3 pb-2 flex-shrink-0"
            style={{ borderBottom: '1px solid rgba(59,91,219,0.07)', background: 'rgba(255,255,255,0.9)' }}>
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="font-bold text-sm" style={{ color: '#0F1C35' }}>المحادثات</h2>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,91,219,0.08)', color: '#3B5BDB' }}>
                {allConvs.length}
              </span>
            </div>
            <div className="relative mb-2.5">
              <MagnifyingGlassIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: '#94A3B8' }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث بالاسم أو الرقم..."
                className="input pr-8 text-xs w-full py-1.5" />
            </div>
            <div className="flex gap-1 overflow-x-auto pb-0.5">
              {([
                { id: 'all',    label: 'الكل',      count: counts.all    },
                { id: 'unread', label: 'غير مقروء', count: counts.unread },
                { id: 'ai',     label: 'AI',         count: counts.ai    },
                { id: 'manual', label: 'يدوي',       count: counts.manual },
              ] as const).map(f => {
                const isActive = filter === f.id;
                return (
                  <button key={f.id} onClick={() => setFilter(f.id as Filter)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap flex-shrink-0 transition-all"
                    style={{
                      background: isActive ? 'rgba(59,91,219,0.1)' : 'transparent',
                      color: isActive ? '#3B5BDB' : '#7A8FAA',
                    }}>
                    {f.label}
                    {f.count > 0 && (
                      <span className="text-[9px] font-bold px-1 py-0.5 rounded-full"
                        style={{ background: isActive ? 'rgba(59,91,219,0.15)' : 'rgba(59,91,219,0.07)', color: '#7A8FAA' }}>
                        {f.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="text-center py-12 px-4">
                <ChatBubbleLeftRightIcon className="w-10 h-10 mx-auto mb-2" style={{ color: '#D1D9EC' }} />
                <p className="text-sm font-medium" style={{ color: '#7A8FAA' }}>
                  {search ? 'لا نتائج' : 'لا توجد محادثات'}
                </p>
              </div>
            ) : filtered.map((conv: any) => (
              <ConvItem key={conv.id} conv={conv}
                isSelected={selectedConv?.id === conv.id}
                onClick={() => handleSelectConv(conv)} />
            ))}
          </div>
        </div>
      )}

      {/* ── Chat Area ──────────────────────────────────────────────────── */}
      {showChat && (
        selectedConv ? (
          <div className="flex-1 flex flex-col min-w-0">

            {/* Chat Header */}
            <div className="flex items-center justify-between px-3 py-2.5 sm:px-4 sm:py-3 flex-shrink-0"
              style={{ borderBottom: '1px solid rgba(59,91,219,0.07)', background: '#fff', boxShadow: '0 1px 0 rgba(59,91,219,0.04)' }}>
              <div className="flex items-center gap-2 sm:gap-3">
                {/* Back button on mobile */}
                {isMobile && (
                  <button onClick={handleBack} className="p-1.5 rounded-lg -mr-1"
                    style={{ color: '#3B5BDB' }}>
                    <ArrowRightIcon className="w-5 h-5" />
                  </button>
                )}
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-white font-bold text-sm"
                  style={{ background: grad(selectedName), flexShrink: 0 }}>
                  {selectedName.charAt(0)}
                </div>
                <div>
                  <p className="font-bold text-sm" style={{ color: '#0F1C35' }}>{selectedName}</p>
                  <p className="text-[10px] font-mono hidden sm:block" style={{ color: '#7A8FAA' }} dir="ltr">{selectedConv.phone}</p>
                </div>
              </div>

              <div className="flex items-center gap-1 sm:gap-1.5">
                <button onClick={() => toggleAI.mutate()}
                  className="flex items-center gap-1 sm:gap-1.5 px-2 py-1.5 sm:px-3 rounded-xl text-xs font-bold transition-all"
                  style={selectedConv.is_ai_enabled
                    ? { background: 'linear-gradient(135deg,#3B5BDB,#5273F5)', color: '#fff', boxShadow: '0 2px 8px rgba(59,91,219,0.3)' }
                    : { background: 'rgba(5,150,105,0.08)', color: '#059669', border: '1px solid rgba(5,150,105,0.2)' }}>
                  {selectedConv.is_ai_enabled
                    ? <><CpuSolid className="w-3.5 h-3.5" /><span className="hidden sm:inline"> AI يعمل</span></>
                    : <><UserIcon className="w-3.5 h-3.5" /><span className="hidden sm:inline"> يدوي</span></>}
                </button>

                <button onClick={() => setShowClientPanel(!showClientPanel)}
                  className="p-2 rounded-xl transition-all"
                  style={{
                    background: showClientPanel ? 'rgba(59,91,219,0.1)' : 'transparent',
                    color: showClientPanel ? '#3B5BDB' : '#7A8FAA',
                  }}
                  title="بيانات العميل">
                  <UserIcon className="w-4 h-4" />
                </button>

                <button onClick={() => setConfirmDelete(true)}
                  className="p-2 rounded-xl transition-all"
                  style={{ color: '#7A8FAA' }}
                  title="حذف المحادثة"
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.07)'; (e.currentTarget as HTMLButtonElement).style.color = '#DC2626'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#7A8FAA'; }}>
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
              <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'rgba(242,246,255,0.3)' }}>

                {/* Manual mode banner */}
                {!selectedConv.is_ai_enabled && (
                  <div className="px-3 sm:px-4 py-2 flex items-center gap-2 flex-shrink-0"
                    style={{ background: 'rgba(5,150,105,0.06)', borderBottom: '1px solid rgba(5,150,105,0.12)' }}>
                    <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#059669' }} />
                    <span className="text-xs font-semibold" style={{ color: '#059669' }}>وضع الموظف — ردودك ترسل مباشرة</span>
                    <button onClick={() => toggleAI.mutate()} className="mr-auto text-xs font-bold underline" style={{ color: '#3B5BDB' }}>
                      تفعيل AI
                    </button>
                  </div>
                )}

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
                  {messages.length === 0 ? (
                    <div className="text-center py-16">
                      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(59,91,219,0.07)' }}>
                        <ChatBubbleLeftRightIcon className="w-8 h-8" style={{ color: '#C4CEDE' }} />
                      </div>
                      <p className="font-semibold" style={{ color: '#5A6882' }}>لا توجد رسائل بعد</p>
                    </div>
                  ) : messages.map((msg: any) => <MessageBubble key={msg.id} msg={msg} />)}
                  <div ref={bottomRef} />
                </div>

                {/* Quick replies */}
                {showQuickReplies && (
                  <div className="px-3 py-2.5 flex-shrink-0"
                    style={{ borderTop: '1px solid rgba(59,91,219,0.07)', background: '#fff' }}>
                    <p className="text-[10px] font-bold mb-2 uppercase tracking-widest" style={{ color: '#94A3B8' }}>ردود سريعة</p>
                    <div className="flex flex-wrap gap-1.5">
                      {QUICK_REPLIES.map((qr) => (
                        <button key={qr.label}
                          onClick={() => { setMessage(qr.text); setShowQuickReplies(false); textareaRef.current?.focus(); }}
                          className="px-2.5 py-1 text-xs font-semibold rounded-full transition-all"
                          style={{ background: 'rgba(59,91,219,0.07)', color: '#3B5BDB', border: '1px solid rgba(59,91,219,0.12)' }}>
                          {qr.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Input bar */}
                <div className="p-2 sm:p-3 flex-shrink-0" style={{ borderTop: '1px solid rgba(59,91,219,0.07)', background: '#fff' }}>
                  <div className="flex items-end gap-1.5 sm:gap-2">
                    <button onClick={() => setShowQuickReplies(!showQuickReplies)} title="ردود سريعة"
                      className="p-2 rounded-xl flex-shrink-0 transition-all"
                      style={{
                        background: showQuickReplies ? 'rgba(59,91,219,0.12)' : 'rgba(242,246,255,0.8)',
                        color: showQuickReplies ? '#3B5BDB' : '#7A8FAA',
                      }}>
                      <BoltIcon className="w-4 h-4" />
                    </button>
                    <textarea ref={textareaRef} value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                      placeholder="اكتب رسالة..."
                      rows={1} className="input flex-1 resize-none text-sm overflow-hidden" style={{ minHeight: '40px' }} />
                    <button onClick={handleSend} disabled={!message.trim() || sendMut.isPending}
                      className="p-2.5 rounded-xl flex-shrink-0 transition-all disabled:opacity-40 text-white"
                      style={{ background: 'linear-gradient(135deg,#3B5BDB,#5273F5)', boxShadow: '0 2px 8px rgba(59,91,219,0.3)' }}>
                      {sendMut.isPending
                        ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin block" />
                        : <PaperAirplaneIcon className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Client panel — hidden on mobile when visible to avoid overlap */}
              {showClientPanel && !isMobile && (
                <ClientPanel conv={selectedConv} onClose={() => setShowClientPanel(false)} />
              )}
            </div>

            {/* Client panel on mobile — full overlay */}
            {showClientPanel && isMobile && (
              <div className="absolute inset-0 z-40" style={{ background: '#fff' }}>
                <ClientPanel conv={selectedConv} onClose={() => setShowClientPanel(false)} />
              </div>
            )}
          </div>
        ) : (
          /* Empty state — desktop only (mobile shows list instead) */
          <div className="flex-1 flex items-center justify-center" style={{ background: 'rgba(242,246,255,0.3)' }}>
            <div className="text-center">
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-5"
                style={{ background: 'rgba(59,91,219,0.07)', border: '1px solid rgba(59,91,219,0.1)' }}>
                <ChatBubbleLeftRightIcon className="w-10 h-10" style={{ color: '#C4CEDE' }} />
              </div>
              <p className="font-bold" style={{ color: '#0F1C35' }}>اختر محادثة</p>
              <p className="text-sm mt-1" style={{ color: '#7A8FAA' }}>اضغط على أي محادثة من القائمة للبدء</p>
            </div>
          </div>
        )
      )}

      {/* Delete Dialog */}
      {confirmDelete && (
        <DeleteDialog
          name={selectedName}
          onConfirm={() => deleteConv.mutate()}
          onCancel={() => setConfirmDelete(false)}
          pending={deleteConv.isPending}
        />
      )}
    </div>
  );
}
