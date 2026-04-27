import { useState, useEffect, useCallback, useRef } from 'react';

interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

const MAX_TOASTS = 5;
const DEFAULT_DURATION = 3000;
const ERROR_DURATION = 5000;

let addToastFn: ((message: string, type?: 'success' | 'error' | 'info') => void) | null = null;

/**
 * 全局 Toast 通知工具，可在任何地方调用
 */
export function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  addToastFn?.(message, type);
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextIdRef = useRef(0);

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = ++nextIdRef.current;
    setToasts(prev => {
      const updated = [...prev, { id, message, type }];
      // 超过上限时移除最早的
      return updated.length > MAX_TOASTS ? updated.slice(-MAX_TOASTS) : updated;
    });

    const duration = type === 'error' ? ERROR_DURATION : DEFAULT_DURATION;
    setTimeout(() => removeToast(id), duration);
  }, [removeToast]);

  useEffect(() => {
    addToastFn = addToast;
    return () => { addToastFn = null; };
  }, [addToast]);

  return { toasts, removeToast };
}

const TOAST_STYLES: Record<string, React.CSSProperties> = {
  success: { background: '#1a4731', borderLeft: '4px solid #22c55e' },
  error: { background: '#4a1a1a', borderLeft: '4px solid #ef4444' },
  info: { background: '#1a2a4a', borderLeft: '4px solid #3b82f6' },
};

export function ToastContainer({ toasts, removeToast }: { toasts: ToastItem[]; removeToast: (id: number) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div role="region" aria-label="通知" aria-live="polite" style={{
      position: 'fixed', top: '16px', right: '16px', zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: '8px'
    }}>
      {toasts.map(t => (
        <div key={t.id} role="alert" style={{
          ...TOAST_STYLES[t.type],
          padding: '12px 36px 12px 20px', borderRadius: '8px', color: '#fff',
          fontSize: '14px', minWidth: '200px', maxWidth: '400px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          animation: 'slideIn 0.3s ease',
          position: 'relative'
        }}>
          {t.message}
          <button
            onClick={() => removeToast(t.id)}
            aria-label="关闭通知"
            style={{
              position: 'absolute', top: '8px', right: '8px',
              background: 'none', border: 'none', color: '#aaa',
              cursor: 'pointer', fontSize: '16px', lineHeight: 1,
              padding: '2px'
            }}
          >
            x
          </button>
        </div>
      ))}
    </div>
  );
}
