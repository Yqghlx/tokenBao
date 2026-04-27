import { useState, useEffect, useCallback } from 'react';

interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

let addToastFn: ((message: string, type?: 'success' | 'error' | 'info') => void) | null = null;

/**
 * 全局 Toast 通知工具，可在任何地方调用
 */
export function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
  addToastFn?.(message, type);
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  let nextId = 0;

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = ++nextId;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  useEffect(() => {
    addToastFn = addToast;
    return () => { addToastFn = null; };
  }, [addToast]);

  return { toasts };
}

const TOAST_STYLES: Record<string, React.CSSProperties> = {
  success: { background: '#1a4731', borderLeft: '4px solid #22c55e' },
  error: { background: '#4a1a1a', borderLeft: '4px solid #ef4444' },
  info: { background: '#1a2a4a', borderLeft: '4px solid #3b82f6' },
};

export function ToastContainer({ toasts }: { toasts: ToastItem[] }) {
  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', top: '16px', right: '16px', zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: '8px'
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          ...TOAST_STYLES[t.type],
          padding: '12px 20px', borderRadius: '8px', color: '#fff',
          fontSize: '14px', minWidth: '200px', maxWidth: '400px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          animation: 'slideIn 0.3s ease'
        }}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
