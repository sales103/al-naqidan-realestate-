import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChatBubbleLeftRightIcon, PaperAirplaneIcon, CpuChipIcon,
  MagnifyingGlassIcon, UserIcon, BoltIcon,
  PhoneIcon, ClockIcon, StarIcon, XMarkIcon,
  PencilSquareIcon, CheckIcon, TrashIcon,
} from '@heroicons/react/24/outline';
import { CpuChipIcon as CpuSolid } from '@heroicons/react/24/solid';
import { conversationsApi, clientsApi } from '../services/api.ts';
import toast from 'react-hot-toast';
import { format, formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';

const QUICK_REPLIES = [
  { label: 'ترحيب',         text: 'أهلاً وسهلاً 👋 كيف يمكنني مساعدتك اليوم؟' },
  { label: 'موعد معاينة',   text: 'بكل سرور! هل تفضل المعاينة صباحاً أم مساءً؟ 📅' },
  { label: 'انتظار موظف',   text: 'سيتواصل معك أحد مستشارينا قريباً إن شاء الله 🤝' },
  { label: 'الميزانية',     text: 'ما هي ميزانيتك التقريبية؟ 💰' },
  { label: 'الحي',          text: 'ما هو الحي أو المنطقة المفضلة لديك؟ 📍' },
  { label: 'الغرض',         text: 'هل تبحث للشراء أم الإيجار؟' },
  { label: 'عدد الغرف',     text: 'كم عدد الغرف التي تحتاجها؟ 🛏' },
  { label: 'شكر',           text: 'شكراً لتواصلك مع مكتب النقيدان 🏡 نسعد بخدمتك دائماً.' },
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new:               { label: 'جديد',        color: 'bg-blue-100 text-blue-700'     },
  contacted:         { label: 'تم التواصل',  color: 'bg-indigo-100 text-indigo-700' },
  interested:        { label: 'مهتم',        color: 'bg-yellow-100 text-yellow-700' },
  viewing_scheduled: { label: 'موعد معاينة', color: 'bg-orange-100 text-orange-700' },
  negotiating:       { label: 'تفاوض',       color: 'bg-purple-100 text-purple-700' },
  closed_won:        { label: 'مكتمل ✓',     color: 'bg-emerald-100 text-emerald-700'},
  closed_lost:       { label: 'خسارة',       color: 'bg-red-100 text-red-700'       },
  follow_up:         { label: 'متابعة',      color: 'bg-cyan-100 text-cyan-700'     },
};

const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([k, v]) => ({ value: k, label: v.label }));

// ─── Conversation List Item ───────────────────────────────────────────────────
function ConvItem({ conv, isSelected, onClick }: { conv: any; isSelected: boolean; onClick: () => void }) {
  const hasUnread = conv.unread_count > 0;
  const isAI = conv.is_ai_enabled;
  return (
    <button onClick={onClick}
      className={`w-full px-3 py-3 text-right hover:bg-white transition-colors border-b border-gray-50 ${isSelected ? 'bg-white shadow-sm' : ''}`}>
      <div className="flex items-start gap-2.5">
        <div className={`relative w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm
          ${isAI ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
          {(conv.full_name ?? conv.phone ?? '?').charAt(0)}
          {isAI && (
            <span className="absolute -bottom-0.5 -left-0.5 w-3.5 h-3.5 bg-blue-600 rounded-full flex items-center justify-center border border-white">
              <CpuChipIcon className="w-2 h-2 text-white" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <p className={`text-sm truncate ${hasUnread ? 'font-bold text-gray-900' : 'font-medium text-gray-800'}`}>
              {conv.full_name ?? conv.phone}
            </p>
            <span className="text-[10px] text-gray-400 flex-shrink-0">
              {conv.last_message_at ? formatDistanceToNow(new Date(conv.last_message_at), { locale: ar, addSuffix: false }) : ''}
            </span>
          </div>
          <div className="flex items-center justify-between mt-0.5">
            <p className="text-xs text-gray-400 truncate flex-1">
              {conv.last_message ?? conv.phone}
            </p>
            {hasUnread && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] bg-green-500 text-white text-[10px] font-bold rounded-full px-1 flex-shrink-0 mr-1">
                {conv.unread_count}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg }: { msg: any }) {
  const isOut = msg.direction === 'outbound';
  const isAI  = msg.is_from_ai;

  return (
    <div className={`flex ${isOut ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[72%] ${isOut ? 'items-start' : 'items-end'} flex flex-col`}>
        {isOut && (
          <span className={`text-[10px] mb-0.5 font-medium ${isAI ? 'text-blue-500' : 'text-emerald-600'}`}>
            {isAI ? '🤖 ذكاء اصطناعي' : '👤 موظف'}
          </span>
        )}
        <div className={`px-4 py-2.5 text-sm shadow-sm leading-relaxed whitespace-pre-wrap ${
          isOut
            ? isAI
              ? 'bg-blue-600 text-white rounded-2xl rounded-tl-sm'
              : 'bg-emerald-600 text-white rounded-2xl rounded-tl-sm'
            : 'bg-white text-gray-900 rounded-2xl rounded-tr-sm border border-gray-100'
        }`}>
          {msg.content ?? `[${msg.message_type ?? 'رسالة'}]`}
        </div>
        <span className="text-[10px] text-gray-400 mt-1 px-1">
          {format(new Date(msg.created_at), 'HH:mm')}
        </span>
      </div>
    </div>
  );
}

// ─── Client Panel ─────────────────────────────────────────────────────────────
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

  const sc = STATUS_LABELS[conv.status] ?? { label: conv.status, color: 'bg-gray-100 text-gray-600' };

  return (
    <div className="w-60 flex-shrink-0 border-r border-gray-100 bg-gray-50/50 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 bg-white">
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">بيانات العميل</span>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 transition-colors">
          <XMarkIcon className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Basic info */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <UserIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span className="font-semibold text-gray-900 truncate">{conv.full_name ?? '—'}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <PhoneIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <a href={`tel:${conv.phone}`} className="text-blue-600 hover:underline" dir="ltr">{conv.phone}</a>
          </div>
          {conv.last_message_at && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <ClockIcon className="w-4 h-4 flex-shrink-0" />
              <span>{formatDistanceToNow(new Date(conv.last_message_at), { locale: ar, addSuffix: true })}</span>
            </div>
          )}
        </div>

        {/* Status */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-gray-500">الحالة</span>
            <button onClick={() => setEditStatus(!editStatus)}
              className="text-[10px] text-blue-500 hover:text-blue-700">
              {editStatus ? 'إلغاء' : 'تغيير'}
            </button>
          </div>
          {editStatus ? (
            <select className="input w-full text-xs"
              defaultValue={conv.status}
              onChange={(e) => updateStatus.mutate(e.target.value)}>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : (
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${sc.color}`}>{sc.label}</span>
          )}
        </div>

        {/* Budget */}
        {conv.budget_max && (
          <div>
            <span className="text-xs font-semibold text-gray-500 block mb-1">الميزانية</span>
            <span className="text-sm font-bold text-gray-800">{Number(conv.budget_max).toLocaleString('ar-SA')} ر.س</span>
          </div>
        )}

        {/* Special requirements */}
        {conv.special_requirements && (
          <div>
            <span className="text-xs font-semibold text-gray-500 block mb-1">متطلبات خاصة</span>
            <p className="text-xs text-gray-600 leading-relaxed bg-white rounded-lg p-2 border border-gray-100">{conv.special_requirements}</p>
          </div>
        )}

        {/* Preferred types */}
        {conv.preferred_property_types?.length > 0 && (
          <div>
            <span className="text-xs font-semibold text-gray-500 block mb-1.5">نوع العقار</span>
            <div className="flex flex-wrap gap-1">
              {conv.preferred_property_types.map((t: string) => (
                <span key={t} className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{t}</span>
              ))}
            </div>
          </div>
        )}

        {/* Add note */}
        <div>
          <span className="text-xs font-semibold text-gray-500 block mb-1.5">إضافة ملاحظة</span>
          <textarea rows={2}
            className="input w-full text-xs resize-none"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="ملاحظة على العميل..." />
          <button
            onClick={() => addNote.mutate()}
            disabled={!newNote.trim() || addNote.isPending}
            className="mt-1.5 w-full py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">
            {addNote.isPending ? 'جاري الحفظ...' : 'حفظ الملاحظة'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ConversationsPage() {
  const [selectedConv, setSelectedConv]   = useState<any>(null);
  const [message, setMessage]             = useState('');
  const [search, setSearch]               = useState('');
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showClientPanel, setShowClientPanel]   = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const qc = useQueryClient();

  const { data: convsRes } = useQuery({
    queryKey: ['conversations'],
    queryFn: conversationsApi.list,
    refetchInterval: 6000,
  });

  const { data: msgsRes } = useQuery({
    queryKey: ['messages', selectedConv?.id],
    queryFn: () => selectedConv ? conversationsApi.messages(selectedConv.id) : Promise.resolve(null),
    enabled: !!selectedConv,
    refetchInterval: 4000,
  });

  const sendMut = useMutation({
    mutationFn: (text: string) => conversationsApi.send(selectedConv.id, text),
    onSuccess: () => {
      setMessage('');
      setShowQuickReplies(false);
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
      setSelectedConv(null);
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: () => toast.error('تعذّر حذف المحادثة'),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgsRes]);

  const conversations = (convsRes as any)?.data?.data ?? [];
  const filtered = conversations.filter((c: any) =>
    !search || (c.full_name ?? '').includes(search) || (c.phone ?? '').includes(search)
  );
  const messages = (msgsRes as any)?.data?.data ?? [];

  const handleSend = () => {
    const text = message.trim();
    if (!text || !selectedConv) return;
    sendMut.mutate(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [message]);

  return (
    <div className="h-[calc(100vh-9rem)] flex rounded-2xl overflow-hidden border border-gray-200 bg-white shadow-sm">

      {/* ── Conversation List ── */}
      <div className="w-72 flex-shrink-0 border-l border-gray-100 flex flex-col bg-gray-50/40">
        <div className="p-3 border-b border-gray-100 bg-white space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-gray-900 text-sm">المحادثات</h2>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {conversations.length}
            </span>
          </div>
          <div className="relative">
            <MagnifyingGlassIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث..." className="input pr-8 text-xs w-full py-1.5" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-400 px-4">
              <ChatBubbleLeftRightIcon className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">{search ? 'لا نتائج' : 'لا توجد محادثات'}</p>
            </div>
          ) : (
            filtered.map((conv: any) => (
              <ConvItem key={conv.id} conv={conv}
                isSelected={selectedConv?.id === conv.id}
                onClick={() => { setSelectedConv(conv); setShowClientPanel(false); }} />
            ))
          )}
        </div>
      </div>

      {/* ── Chat Area ── */}
      {selectedConv ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-white flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm
                ${selectedConv.is_ai_enabled ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {(selectedConv.full_name ?? selectedConv.phone ?? '?').charAt(0)}
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">{selectedConv.full_name ?? selectedConv.phone}</p>
                <p className="text-xs text-gray-400" dir="ltr">{selectedConv.phone}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* AI Toggle */}
              <button onClick={() => toggleAI.mutate()}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  selectedConv.is_ai_enabled
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-200'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                {selectedConv.is_ai_enabled
                  ? <><CpuSolid className="w-3.5 h-3.5" /> AI يعمل</>
                  : <><CpuChipIcon className="w-3.5 h-3.5" /> AI متوقف</>
                }
              </button>

              {/* Client info toggle */}
              <button onClick={() => setShowClientPanel(!showClientPanel)}
                className={`p-1.5 rounded-lg transition-colors ${showClientPanel ? 'bg-gray-200 text-gray-700' : 'text-gray-400 hover:bg-gray-100'}`}
                title="بيانات العميل">
                <UserIcon className="w-4 h-4" />
              </button>

              {/* Delete conversation */}
              <button
                onClick={() => {
                  if (window.confirm('حذف هذه المحادثة وكل رسائلها نهائياً؟ لا يمكن التراجع.')) deleteConv.mutate();
                }}
                disabled={deleteConv.isPending}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 transition-colors"
                title="حذف المحادثة">
                <TrashIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Messages + Input */}
            <div className="flex-1 flex flex-col overflow-hidden bg-gray-50/30">
              {/* AI status bar */}
              {!selectedConv.is_ai_enabled && (
                <div className="bg-emerald-50 border-b border-emerald-100 px-4 py-2 flex items-center gap-2">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-xs font-medium text-emerald-700">وضع الموظف — ردودك ستُرسل مباشرةً عبر واتساب</span>
                  <button onClick={() => toggleAI.mutate()}
                    className="mr-auto text-xs text-emerald-600 hover:text-emerald-800 underline">
                    تفعيل AI
                  </button>
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 ? (
                  <div className="text-center py-16 text-gray-400">
                    <ChatBubbleLeftRightIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="text-sm font-medium text-gray-500">لا توجد رسائل بعد</p>
                  </div>
                ) : (
                  messages.map((msg: any) => <MessageBubble key={msg.id} msg={msg} />)
                )}
                <div ref={bottomRef} />
              </div>

              {/* Quick replies */}
              {showQuickReplies && (
                <div className="px-3 pb-2 pt-2 border-t border-gray-100 bg-white">
                  <p className="text-[10px] text-gray-400 mb-2 font-semibold uppercase tracking-wide">ردود سريعة</p>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_REPLIES.map((qr) => (
                      <button key={qr.label}
                        onClick={() => { setMessage(qr.text); setShowQuickReplies(false); textareaRef.current?.focus(); }}
                        className="px-2.5 py-1 bg-gray-100 border border-gray-200 rounded-full text-xs text-gray-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors">
                        {qr.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Input bar */}
              <div className="p-3 border-t border-gray-100 bg-white flex-shrink-0">
                <div className="flex items-end gap-2">
                  <button onClick={() => setShowQuickReplies(!showQuickReplies)}
                    title="ردود سريعة"
                    className={`p-2 rounded-xl flex-shrink-0 transition-colors ${showQuickReplies ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    <BoltIcon className="w-4 h-4" />
                  </button>
                  <textarea
                    ref={textareaRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="اكتب رسالة... (Enter للإرسال، Shift+Enter سطر جديد)"
                    rows={1}
                    className="input flex-1 resize-none text-sm overflow-hidden"
                    style={{ minHeight: '40px' }}
                  />
                  <button onClick={handleSend}
                    disabled={!message.trim() || sendMut.isPending}
                    className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 flex-shrink-0 transition-colors">
                    {sendMut.isPending
                      ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin block" />
                      : <PaperAirplaneIcon className="w-4 h-4" />
                    }
                  </button>
                </div>
              </div>
            </div>

            {/* Client panel */}
            {showClientPanel && (
              <ClientPanel conv={selectedConv} onClose={() => setShowClientPanel(false)} />
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-50/30">
          <div className="text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-3xl flex items-center justify-center mx-auto mb-4">
              <ChatBubbleLeftRightIcon className="w-10 h-10 text-gray-300" />
            </div>
            <p className="font-semibold text-gray-600">اختر محادثة</p>
            <p className="text-sm text-gray-400 mt-1">اضغط على أي محادثة من القائمة</p>
          </div>
        </div>
      )}
    </div>
  );
}