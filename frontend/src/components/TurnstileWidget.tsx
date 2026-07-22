import { useEffect, useRef, useId } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: object) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

const SITE_KEY = import.meta.env['VITE_TURNSTILE_SITE_KEY'] as string | undefined;

interface Props {
  onToken: (token: string) => void;
  onExpire?: () => void;
}

export default function TurnstileWidget({ onToken, onExpire }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId     = useRef<string | null>(null);
  const uid          = useId();

  useEffect(() => {
    if (!SITE_KEY) return;

    const render = () => {
      if (!containerRef.current || widgetId.current) return;
      widgetId.current = window.turnstile!.render(containerRef.current, {
        sitekey:  SITE_KEY,
        callback: onToken,
        'expired-callback': () => {
          onExpire?.();
          if (widgetId.current) window.turnstile!.reset(widgetId.current);
        },
        theme:    'light',
        language: 'ar',
        size:     'normal',
      });
    };

    if (window.turnstile) {
      render();
    } else {
      const id = `ts-cb-${uid.replace(/:/g, '')}`;
      (window as any)[id] = render;
      const script = document.createElement('script');
      script.src = `https://challenges.cloudflare.com/turnstile/v0/api.js?onload=${id}&render=explicit`;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
      return () => { document.head.removeChild(script); delete (window as any)[id]; };
    }

    return () => {
      if (widgetId.current) {
        window.turnstile?.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!SITE_KEY) return null;

  return <div ref={containerRef} className="flex justify-center mt-1" />;
}
