import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/auth.store.ts';

// Simple beep using Web Audio API
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch { /* ignore */ }
}

export function useRealtimeNotifications() {
  const token = useAuthStore(s => s.token);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!token) return;

    const apiBase = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000/api';
    const url = `${apiBase}/events?token=${token}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener('connected', () => {
      console.log('[SSE] Connected to real-time notifications');
    });

    es.addEventListener('new_message', (e) => {
      try {
        const data = JSON.parse(e.data);
        playNotificationSound();
        toast.custom((t) => (
          <div
            className={`flex items-start gap-3 bg-white shadow-lg rounded-xl p-3 border-r-4 border-green-500 max-w-sm cursor-pointer ${t.visible ? 'animate-slide-in' : ''}`}
            onClick={() => { toast.dismiss(t.id); window.location.href = '/conversations'; }}
          >
            <div className="w-9 h-9 bg-green-100 rounded-full flex items-center justify-center text-lg flex-shrink-0">📱</div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">{data.clientName || data.phone}</p>
              <p className="text-xs text-gray-500 truncate mt-0.5">{data.content}</p>
              <p className="text-xs text-green-600 mt-1">رسالة واتساب جديدة • انقر للعرض</p>
            </div>
          </div>
        ), { duration: 6000, position: 'bottom-left' });
      } catch { /* ignore */ }
    });

    es.onerror = () => {
      // Auto-reconnects via EventSource
    };

    return () => { es.close(); esRef.current = null; };
  }, [token]);
}