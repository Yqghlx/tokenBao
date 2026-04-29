import '@testing-library/jest-dom';
import { renderHook, act } from '@testing-library/react';
import { usePolling } from '../hooks/usePolling';

describe('usePolling', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('应在指定间隔调用回调', () => {
    const callback = jest.fn();
    renderHook(() => usePolling(callback, 1000));

    // 初始注册后第一次 interval 触发
    act(() => { jest.advanceTimersByTime(1000); });
    expect(callback).toHaveBeenCalledTimes(1);

    act(() => { jest.advanceTimersByTime(1000); });
    expect(callback).toHaveBeenCalledTimes(2);
  });

  test('组件卸载时清理 interval', () => {
    const callback = jest.fn();
    const { unmount } = renderHook(() => usePolling(callback, 1000));

    unmount();
    act(() => { jest.advanceTimersByTime(5000); });

    // 卸载后回调不应再被调用
    expect(callback).not.toHaveBeenCalled();
  });

  test('回调异常不中断后续轮询', () => {
    const callback = jest.fn()
      .mockImplementationOnce(() => { throw new Error('同步异常'); })
      .mockImplementationOnce(() => { /* 恢复正常 */ });

    renderHook(() => usePolling(callback, 1000));

    act(() => { jest.advanceTimersByTime(1000); });
    expect(callback).toHaveBeenCalledTimes(1);

    // 异常后下一次轮询应继续
    act(() => { jest.advanceTimersByTime(1000); });
    expect(callback).toHaveBeenCalledTimes(2);
  });

  test('异步回调拒绝不中断后续轮询', async () => {
    const callback = jest.fn()
      .mockRejectedValueOnce(new Error('异步异常'))
      .mockResolvedValueOnce(undefined);

    renderHook(() => usePolling(callback, 1000));

    act(() => { jest.advanceTimersByTime(1000); });
    expect(callback).toHaveBeenCalledTimes(1);

    // 等待 Promise 微任务完成
    await act(async () => { await Promise.resolve(); });

    act(() => { jest.advanceTimersByTime(1000); });
    expect(callback).toHaveBeenCalledTimes(2);
  });

  test('页面隐藏时暂停轮询，可见时恢复', () => {
    const callback = jest.fn();
    renderHook(() => usePolling(callback, 1000));

    // 模拟页面隐藏
    act(() => {
      Object.defineProperty(document, 'hidden', { value: true, writable: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // 隐藏期间不触发回调
    act(() => { jest.advanceTimersByTime(5000); });
    expect(callback).not.toHaveBeenCalled();

    // 模拟页面可见 — 恢复时立即调用一次
    act(() => {
      Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(callback).toHaveBeenCalledTimes(1);

    // 恢复后正常轮询
    act(() => { jest.advanceTimersByTime(1000); });
    expect(callback).toHaveBeenCalledTimes(2);
  });

  test('callback 更新时使用最新版本', () => {
    const callback1 = jest.fn();
    const callback2 = jest.fn();

    const { rerender } = renderHook(
      ({ cb, interval }) => usePolling(cb, interval),
      { initialProps: { cb: callback1, interval: 1000 } }
    );

    // 更新 callback
    rerender({ cb: callback2, interval: 1000 });

    act(() => { jest.advanceTimersByTime(1000); });
    // 应调用新的 callback
    expect(callback2).toHaveBeenCalledTimes(1);
    expect(callback1).not.toHaveBeenCalled();
  });

  test('intervalMs 变更时重建轮询', () => {
    const callback = jest.fn();

    const { rerender } = renderHook(
      ({ cb, interval }) => usePolling(cb, interval),
      { initialProps: { cb: callback, interval: 1000 } }
    );

    // 变更间隔为 500ms
    rerender({ cb: callback, interval: 500 });

    act(() => { jest.advanceTimersByTime(500); });
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
