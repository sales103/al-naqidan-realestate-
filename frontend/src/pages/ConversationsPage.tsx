import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChatBubbleLeftRightIcon, PaperAirplaneIcon, CpuChipIcon,
  MagnifyingGlassIcon, UserIcon, BoltIcon, ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline';
import { conversationsApi } from '../services/api.ts';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

const QUICK_REPLIES = [
  { label: 'ترحيب',       text: 'أهلاً وسهلاً 🏠 كيف يمكنني مساعدتك اليوم؟' },
  { label: 'موعد معاينة', text: 'بكل سرور! هل تفضل المعاينة صباحاً أم مساءً؟ 📅' },
  { label: 'انتظار موظف', text: 'سيتواصل معك أحد مستشارينا قريباً إن شاء الله 🤝' },
  { label: 'الميزانية',   text: 'ما هي ميزانيتك التقريبية؟ 💰' },
  { label: 'الحي',        text: 'ما هو الحي أو المنطقة المفضلة لديك؟ 📍' },
  { label: 'الغرض',       text: 'هل تبحث للشراء أم الإيجار؟' },
  { label: 'عدد الغرف',   text: 'كم عدد الغرف التي تحتاجها؟ 🛏' },
  { label: 'شكر',         text: 'شكراً لتواصلك مع مكتب النقيدان 🏠 نسعد بخدمتك دائماً.' },
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new:                { label: 'جديد',             color: 'bg-blue-100 text-blue-700' },
  contacted:          { label: 'تم التواصل',       color: 'bg-indigo-100 text-indigo-700' },
  interested:         { label: 'مهتم',             color: 'bg-yellow-100 text-yellow-700' },
  viewing_scheduled:  { label: 'موعد معاينة',      color: 'bg-orange-100 text-orange-700' },
  negotiating:        { label: 'تفاوض',            color: 'bg-purple-100 text-purple-700' },
  closed_won:         { label: 'مكتمل ✓',          color: 'bg-emerald-100 text-emerald-700' },
  closed_lost:        { label: 'خسارة',            color: 'bg-red-100 text-red-700' },
};

export default function ConversationsPage() {
  const [selectedConv, setSelectedConv] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showClientInfo, setShowClientInfo] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data: convsRes } = useQuery({
    queryKey: ['conversations'],
    queryFn: conversationsApi.list,
    refetchInterval: 8000,
  });

  const { data: msgsRes } = useQuery({
    queryKey: ['messages', selectedConv?.id],
    queryFn: () => selectedConv ? conversationsApi.messages(selectedConv.id) : null,
    enabled: !!selectedConv,
    refetchInterval: 4000,
  });

  const sendMutation = useMutation({
    mutationFn: (text: string) => conversationsApi.send(selectedConv.id, text),
    onSuccess: () => {
      setMessage('');
      setShowQuickReplies(false);
      queryClient.invalidateQueries({ queryKey: ['messages', selectedConv.id] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: () => toast.error('فشل إرسال الرسالة'),
  });

  const toggleAIMutation = useMutation({
    mutationFn: () => conversationsApi.toggleAI(selectedConv.id),
    onSuccess: (res) => {
      const enabled = (res as any).data.data.is_ai_enabled;
      toast.success(enabled ? '🤖 تم تفعيل الذكاء الاصطناعي' : '👤 تم إيقاف الذكاء الاصطناعي — أنت في التحكم');
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setSelectedConv((prev: any) => prev ? { ...prev, is_ai_enabled: enabled } : prev);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgsRes]);

  const conversations = (convsRes as any)?.data?.data ?? [];
  const filtered = conversations.filter((c: any) =>
    !search || c.full_name?.includes(search) || c.phone?.includes(search)
  );
  const messages = (msgsRes as any)?.data?.data ?? [];

  const handleSend = () => {
    if (!message.trim() || !selectedConv) return;
    sendMutation.mutate(message.trim());
  };

  const applyQuickReply = (text: string) => {
    setMessage(text);
    setShowQuickReplies(false);
  };

  return (
    <div className="h-[calc(100vh-9rem)] flex gap-0 rounded-2xl overflow-hidden border border-gray-200 bg-white shadow-sm">

      {/* ── Conversations List ── */}
      <div className="w-72 flex-shrink-0 border-l border-gray-100 flex flex-col bg-gray-50/50">
        <div className="p-4 border-b border-gray-100 bg-white">
          <h2 className="font-bold text-gray-900 mb-3 text-sm">المحادثات</h2>
          <div className="relative">
            <MagnifyingGlassIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو الرقم..." className="input pr-9 text-sm w-full" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-gray-400 px-4">
              <ChatBubbleLeftRightIcon className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">لا توجد محادثات</p>
            </div>
          ) : (
            filtered.map((conv: any) => {
              const isSelected = selectedConv?.id === conv.id;
              const hasUnread = conv.unread_count > 0;
              return (
                <button key={conv.id} onClick={() => { setSelectedConv(conv); setShowClientInfo(false); }}
                  className={`w-full p-3 text-right hover:bg-white transition-colors ${isSelected ? 'bg-white shadow-sm' : ''}`}>
                  <div className="flex items-start gap-2.5">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${conv.is_ai_enabled ? 'bg-blue-100' : 'bg-green-100'}`}>
                      <span className={`font-bold text-sm ${conv.is_ai_enabled ? 'text-blue-700' : 'text-green-700'}`}>
                        {conv.full_name?.charAt(0) ?? '؟'}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <p className={`text-sm truncate ${hasUnread ? 'font-bold text-gray-900' : 'font-medium text-gray-800'}`}>
                          {conv.full_name ?? conv.phone}
                        </p>
                        <span className="text-[10px] text-gray-400 flex-shrink-0">
                          {conv.last_message_at ? format(new Date(conv.last_message_at), 'HH:mm') : ''}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-xs text-gray-500 truncate flex-1">{conv.last_message ?? conv.phone}</p>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {conv.is_ai_enabled && <CpuChipIcon className="w-3 h-3 text-blue-400" />}
                          {hasUnread && (
                            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] bg-green-500 text-white text-[10px] font-bold rounded-full px-1">
                              {conv.unread_count}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Chat Area ── */}
      {selectedConv ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center ${selectedConv.is_ai_enabled ? 'bg-blue-100' : 'bg-green-100'}`}>
                <span className={`font-bold text-sm ${selectedConv.is_ai_enabled ? 'text-blue-700' : 'text-green-700'}`}>
                  {selectedConv.full_name?.charAt(0)}
                </span>
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">{selectedConv.full_name}</p>
                <p className="text-xs text-gray-500 dir-ltr">{selectedConv.phone}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowClientInfo(!showClientInfo)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${showClientInfo ? 'bg-gray-200 text-gray-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                <UserIcon className="w-3.5 h-3.5" />
                بيانات العميل
              </button>
              <button onClick={() => toggleAIMutation.mutate()}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  selectedConv.is_ai_enabled
                    ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}>
                {selectedConv.is_ai_enabled
                  ? <><CpuChipIcon className="w-3.5 h-3.5" /> AI يعمل</>
                  : <><ArrowRightOnRectangleIcon className="w-3.5 h-3.5" /> أنت في التحكم</>
                }
              </button>
            </div>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Messages */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {messages.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <ChatBubbleLeftRightIcon className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">لا توجد رسائل بعد</p>
                  </div>
                ) : (
                  messages.map((msg: any) => {
                    const isOutbound = msg.direction === 'outbound';
                    const isAI = msg.is_from_ai;
                    return (
                      <div key={msg.id} className={`flex ${isOutbound ? 'justify-start' : 'justify-end'}`}>
                        <div className={`max-w-[75%] px-3.5 py-2.5 text-sm shadow-sm whitespace-pre-wrap ${
                          isOutbound
                            ? isAI
                              ? 'bg-blue-600 text-white rounded-2xl rounded-tl-sm'
                              : 'bg-emerald-600 text-white rounded-2xl rounded-tl-sm'
                            : 'bg-gray-100 text-gray-900 rounded-2xl rounded-tr-sm'
                        }`}>
                          {msg.content ?? `[${msg.message_type}]`}
                          <div className={`flex items-center gap-1 mt-1 ${isOutbound ? 'justify-start' : 'justify-end'}`}>
                            {isAI && <span className="text-blue-200 text-[10px] flex items-center gap-0.5"><CpuChipIcon className="w-2.5 h-2.5" />AI</span>}
                            {isOutbound && !isAI && <span className="text-emerald-200 text-[10px]">موظف</span>}
                            <span className={`text-[10px] ${isOutbound ? 'text-white/50' : 'text-gray-400'}`}>
                              {format(new Date(msg.created_at), 'HH:mm')}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              {/* Quick Replies */}
              {showQuickReplies && (
                <div className="px-4 pb-2 border-t border-gray-100 pt-2 bg-gray-50">
                  <p className="text-xs text-gray-500 mb-2 font-medium">ردود سريعة:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_REPLIES.map((qr) => (
                      <button key={qr.label} onClick={() => applyQuickReply(qr.text)}
                        className="px-2.5 py-1 bg-white border border-gray-200 rounded-full text-xs text-gray-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors">
                        {qr.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Input */}
              <div className="p-3 border-t border-gray-100 bg-white">
                {!selectedConv.is_ai_enabled && (
                  <p className="text-xs text-emerald-600 mb-2 font-medium flex items-center gap-1">
                    <ArrowRightOnRectangleIcon className="w-3.5 h-3.5" />
                    وضع الموظف — ردودك ستُرسل مباشرةً عبر واتساب
                  </p>
                )}
                <div className="flex items-end gap-2">
                  <button onClick={() => setShowQuickReplies(!showQuickReplies)}
                    title="ردود سريعة"
                    className={`p-2 rounded-xl transition-colors flex-shrink-0 ${showQuickReplies ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    <BoltIcon className="w-4 h-4" />
                  </button>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder="اكتب رسالة... (Enter للإرسال، Shift+Enter سطر جديد)"
                    rows={1}
                    className="input flex-1 resize-none text-sm"
                    style={{ minHeight: '40px', maxHeight: '120px' }}
                  />
                  <button onClick={handleSend}
                    disabled={!message.trim() || sendMutation.isPending}
                    className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-40 flex-shrink-0">
                    <PaperAirplaneIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Client Info Sidebar */}
            {showClientInfo && (
              <div className="w-56 flex-shrink-0 border-r border-gray-100 bg-gray-50/50 overflow-y-auto p-3 space-y-3">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">بيانات العميل</p>

                <div className="space-y-2">
                  <div>
                    <p className="text-[10px] text-gray-400">الاسم</p>
                    <p className="text-sm font-medium text-gray-900">{selectedConv.full_name ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400">الهاتف</p>
                    <p className="text-sm text-gray-700 dir-ltr">{selectedConv.phone}</p>
                  </div>
                  {selectedConv.status && (
                    <div>
                      <p className="text-[10px] text-gray-400 mb-1">الحالة</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_LABELS[selectedConv.status]?.color ?? 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABELS[selectedConv.status]?.label ?? selectedConv.status}
                      </span>
                    </div>
                  )}
                  {selectedConv.budget_max && (
                    <div>
                      <p className="text-[10px] text-gray-400">الميزانية القصوى</p>
                      <p className="text-sm font-medium text-gray-900">{Number(selectedConv.budget_max).toLocaleString('ar-SA')} ر</p>
                    </div>
                  )}
                  {selectedConv.city_name && (
                    <div>
                      <p className="text-[10px] text-gray-400">المدينة</p>
                      <p className="text-sm text-gray-700">{selectedConv.city_name}</p>
                    </div>
                  )}
                  {selectedConv.preferred_property_types?.length > 0 && (
                    <div>
                      <p className="text-[10px] text-gray-400">نوع العقار</p>
                      <p className="text-sm text-gray-700">{selectedConv.preferred_property_types.join('، ')}</p>
                    </div>
                  )}
                  {selectedConv.special_requirements && (
                    <div>
                      <p className="text-[10px] text-gray-400">متطلبات خاصة</p>
                      <p className="text-xs text-gray-600 leading-relaxed">{selectedConv.special_requirements}</p>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-gray-200">
                  <p className="text-[10px] text-gray-400 mb-1">آخر تواصل</p>
                  <p className="text-xs text-gray-600">
                    {selectedConv.last_message_at
                      ? format(new Date(selectedConv.last_message_at), 'dd MMM yyyy HH:mm', { locale: ar })
                      : '—'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-50/50">
          <div className="text-center">
            <ChatBubbleLeftRightIcon className="w-16 h-16 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">اختر محادثة</p>
            <p className="text-gray-400 text-sm mt-1">اضغط على أي محادثة من القائمة</p>
          </div>
        </div>
      )}
    </div>
  );
}
