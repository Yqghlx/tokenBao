import { useEffect, useRef } from 'react';

/**
 * 页面可见性感知的轮询 hook
 * 页面隐藏时暂停轮询，可见时恢复，避免后台不必要的 IPC 调用
 */
export function usePolling(callback: () => void, intervalMs: number): void {
  const savedCallback = useRef(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    let timerId: ReturnType<typeof setInterval>;

    const startPolling = () => {
      timerId = setInterval(() => savedCallback.current(), intervalMs);
    };

    const stopPolling = () => {
      clearInterval(timerId);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        // 页面重新可见时立即刷新一次再恢复轮询
        savedCallback.current();
        startPolling();
      }
    };

    startPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [intervalMs]);
}
