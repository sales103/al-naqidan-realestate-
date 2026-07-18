import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChatBubbleLeftRightIcon, PaperAirplaneIcon, CpuChipIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { conversationsApi } from '../services/api.ts';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

export default function ConversationsPage() {
  const [selectedConv, setSelectedConv] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const { data: convsRes } = useQuery({
    queryKey: ['conversations'],
    queryFn: conversationsApi.list,
    refetchInterval: 10000,
  });

  const { data: msgsRes } = useQuery({
    queryKey: ['messages', selectedConv?.id],
    queryFn: () => selectedConv ? conversationsApi.messages(selectedConv.id) : null,
    enabled: !!selectedConv,
    refetchInterval: 5000,
  });

  const sendMutation = useMutation({
    mutationFn: (text: string) => conversationsApi.send(selectedConv.id, text),
    onSuccess: () => {
      setMessage('');
      queryClient.invalidateQueries({ queryKey: ['messages', selectedConv.id] });
    },
    onError: () => toast.error('فشل إرسال الرسالة'),
  });

  const toggleAIMutation = useMutation({
    mutationFn: () => conversationsApi.toggleAI(selectedConv.id),
    onSuccess: (res) => {
      const enabled = res.data.data.is_ai_enabled;
      toast.success(enabled ? 'تم تفعيل الذكاء الاصطناعي' : 'تم إيقاف الذكاء الاصطناعي');
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const conversations = (convsRes?.data?.data ?? []).filter((c: any) =>
    !search || c.full_name?.includes(search) || c.phone?.includes(search)
  );

  const messages = msgsRes?.data?.data ?? [];

  const handleSend = () => {
    if (!message.trim() || !selectedConv) return;
    sendMutation.mutate(message.trim());
  };

  return (
    <div className="h-[calc(100vh-9rem)] flex gap-0 rounded-2xl overflow-hidden border border-gray-200 bg-white">
      {/* Conversations List */}
      <div className="w-80 flex-shrink-0 border-l border-gray-100 flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 mb-3">المحادثات</h2>
          <div className="relative">
            <MagnifyingGlassIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث..."
              className="input pr-9 text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <ChatBubbleLeftRightIcon className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">لا توجد محادثات</p>
            </div>
          ) : (
            conversations.map((conv: any) => (
              <button
                key={conv.id}
                onClick={() => setSelectedConv(conv)}
                className={`w-full p-4 text-right hover:bg-gray-50 transition-colors border-b border-gray-50 ${
                  selectedConv?.id === conv.id ? 'bg-blue-50' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="font-bold text-green-700 text-sm">{conv.full_name?.charAt(0)}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900 truncate">{conv.full_name}</p>
                      {conv.last_message_at && (
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {format(new Date(conv.last_message_at), 'HH:mm')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-0.5">
                      {conv.last_message ?? conv.phone}
                    </p>
                    {conv.unread_count > 0 && (
                      <span className="mt-1 inline-flex items-center justify-center w-5 h-5 bg-green-500 text-white text-xs rounded-full">
                        {conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      {selectedConv ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Chat Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <span className="font-bold text-green-700">{selectedConv.full_name?.charAt(0)}</span>
              </div>
              <div>
                <p className="font-semibold text-gray-900">{selectedConv.full_name}</p>
                <p className="text-xs text-gray-500">{selectedConv.phone}</p>
              </div>
            </div>
            <button
              onClick={() => toggleAIMutation.mutate()}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                selectedConv.is_ai_enabled
                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <CpuChipIcon className="w-4 h-4" />
              {selectedConv.is_ai_enabled ? 'الذكاء الاصطناعي يعمل' : 'الذكاء الاصطناعي متوقف'}
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg: any) => {
              const isOutbound = msg.direction === 'outbound';
              const isAI = msg.is_from_ai;
              return (
                <div key={msg.id} className={`flex ${isOutbound ? 'justify-start' : 'justify-end'}`}>
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-3 text-sm shadow-sm ${
                      isOutbound
                        ? isAI
                          ? 'chat-bubble-ai'
                          : 'chat-bubble-out'
                        : 'chat-bubble-in border border-gray-100'
                    }`}
                  >
                    {msg.content ?? (msg.message_type !== 'text' ? `[${msg.message_type}]` : '')}
                    <div className={`flex items-center gap-1 mt-1 ${isOutbound ? 'justify-start' : 'justify-end'}`}>
                      {isAI && (
                        <span className="text-blue-200 text-xs flex items-center gap-0.5">
                          <CpuChipIcon className="w-3 h-3" /> AI
                        </span>
                      )}
                      <span className={`text-xs ${isOutbound ? 'text-white/60' : 'text-gray-400'}`}>
                        {format(new Date(msg.created_at), 'HH:mm')}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Input */}
          <div className="p-4 border-t border-gray-100">
            <div className="flex items-center gap-3">
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                placeholder="اكتب رسالة..."
                className="input flex-1"
              />
              <button
                onClick={handleSend}
                disabled={!message.trim() || sendMutation.isPending}
                className="btn-primary py-2.5 disabled:opacity-50"
              >
                <PaperAirplaneIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <ChatBubbleLeftRightIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">اختر محادثة لعرضها</p>
            <p className="text-gray-400 text-sm mt-1">اختر من القائمة على اليسار</p>
          </div>
        </div>
      )}
    </div>
  );
}
