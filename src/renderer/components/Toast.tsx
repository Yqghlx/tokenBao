import { useState, useEffect, useCallback, useRef } from 'react';

type ToastType = 'success' | 'error' | 'info' | 'loading';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

const MAX_TOASTS = 5;
const DEFAULT_DURATION = 3000;
const ERROR_DURATION = 5000;

let addToastFn: ((message: string, type?: ToastType) => void) | null = null;

/**
 * 全局 Toast 通知工具，可在任何地方调用
 * loading 类型不会自动关闭，需手动调用 removeToast
 */
export function showToast(message: string, type: ToastType = 'info'): number {
  const id = Date.now();
  addToastFn?.(message, type);
  return id;
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextIdRef = useRef(0);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++nextIdRef.current;
    setToasts(prev => {
      const updated = [...prev, { id, message, type }];
      // 超过上限时移除最早的，并清理对应的定时器
      if (updated.length > MAX_TOASTS) {
        const removed = updated.slice(0, updated.length - MAX_TOASTS);
        removed.forEach(t => {
          const timer = timersRef.current.get(t.id);
          if (timer) {
            clearTimeout(timer);
            timersRef.current.delete(t.id);
          }
        });
        return updated.slice(-MAX_TOASTS);
      }
      return updated;
    });

    // loading 类型不自动关闭
    if (type !== 'loading') {
      const duration = type === 'error' ? ERROR_DURATION : DEFAULT_DURATION;
      const timer = setTimeout(() => removeToast(id), duration);
      timersRef.current.set(id, timer);
    }
  }, [removeToast]);

  useEffect(() => {
    addToastFn = addToast;
    return () => {
      addToastFn = null;
      // 组件卸载时清理所有定时器
      timersRef.current.forEach(timer => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, [addToast]);

  return { toasts, removeToast };
}

const TOAST_STYLES: Record<string, React.CSSProperties> = {
  success: { background: '#1a4731', borderLeft: '4px solid #22c55e' },
  error: { background: '#4a1a1a', borderLeft: '4px solid #ef4444' },
  info: { background: '#1a2a4a', borderLeft: '4px solid #3b82f6' },
  loading: { background: '#1a2a4a', borderLeft: '4px solid #00d4ff' },
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
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          {t.type === 'loading' && (
            <span style={{
              display: 'inline-block',
              width: '14px',
              height: '14px',
              border: '2px solid rgba(255,255,255,0.3)',
              borderTopColor: '#fff',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
              flexShrink: 0
            }} />
          )}
          <span>{t.message}</span>
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
