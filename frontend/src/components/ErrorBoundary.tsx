import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { error: Error | null }

/**
 * Without this, an uncaught error during render unmounts the entire React tree
 * and the user is left staring at a blank white page with no explanation and
 * no way back short of a manual refresh. Catch it, keep the app's identity on
 * screen, and offer a way out.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Kept in the console so the stack is recoverable from a user's browser.
    console.error('[ErrorBoundary] render failed:', error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  private goHome = (): void => {
    window.location.href = '/dashboard';
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        dir="rtl"
        className="min-h-screen flex items-center justify-center p-4"
        style={{ background: 'linear-gradient(135deg,#060C18 0%,#0B1525 50%,#060C18 100%)' }}
      >
        <div
          className="w-full max-w-md rounded-3xl p-8 text-center"
          style={{
            background: 'rgba(255,255,255,0.97)',
            boxShadow: '0 24px 80px rgba(6,12,24,0.5)',
            border: '1px solid rgba(200,168,75,0.12)',
          }}
        >
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
            style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.15)' }}
          >
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="#DC2626" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>

          <h1 className="text-lg font-bold mb-2" style={{ color: '#0F1C35' }}>
            حدث خطأ غير متوقع
          </h1>
          <p className="text-sm mb-1" style={{ color: '#5A6882' }}>
            تعذّر عرض هذه الصفحة. بياناتك لم تتأثر.
          </p>
          <p className="text-xs mb-6" style={{ color: '#94A3B8' }}>
            جرّب العودة للوحة التحكم، وإن تكرر الخطأ أبلغ الدعم الفني.
          </p>

          <div className="flex gap-3 justify-center">
            <button
              onClick={this.reset}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold"
              style={{ color: '#5A6882', background: 'rgba(59,91,219,0.06)' }}
            >
              إعادة المحاولة
            </button>
            <button
              onClick={this.goHome}
              className="px-5 py-2.5 rounded-xl text-sm font-bold text-white"
              style={{
                background: 'linear-gradient(135deg,#3B5BDB,#5273F5)',
                boxShadow: '0 2px 8px rgba(59,91,219,0.3)',
              }}
            >
              لوحة التحكم
            </button>
          </div>

          {/* The message is shown but never the stack — it can carry data the
              person on screen should not necessarily see. */}
          <p
            className="mt-6 pt-4 text-[11px] font-mono break-words"
            style={{ borderTop: '1px solid rgba(59,91,219,0.08)', color: '#C4CEDE' }}
            dir="ltr"
          >
            {error.message}
          </p>
        </div>
      </div>
    );
  }
}
