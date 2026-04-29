import '@testing-library/jest-dom';
import { screen, act } from '@testing-library/react';
import { render } from '@testing-library/react';
import { showToast, useToast, ToastContainer } from '../components/Toast';

/** 包含 ToastContainer 的渲染包装 */
function ToastHost() {
  const { toasts, removeToast } = useToast();
  return <ToastContainer toasts={toasts} removeToast={removeToast} />;
}

describe('Toast', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** 渲染 ToastHost 并等待 useEffect 完成（addToastFn 就绪） */
  function renderToastHost() {
    const result = render(<ToastHost />);
    // 等待 useEffect 设置 addToastFn
    act(() => { jest.advanceTimersByTime(0); });
    return result;
  }

  test('showToast 应渲染消息文本', () => {
    renderToastHost();
    act(() => { showToast('测试消息', 'info'); });
    expect(screen.getByText('测试消息')).toBeInTheDocument();
  });

  test('success 类型应渲染', () => {
    renderToastHost();
    act(() => { showToast('成功', 'success'); });
    expect(screen.getByText('成功')).toBeInTheDocument();
  });

  test('error 类型应渲染', () => {
    renderToastHost();
    act(() => { showToast('失败', 'error'); });
    expect(screen.getByText('失败')).toBeInTheDocument();
  });

  test('loading 类型应渲染旋转指示器', () => {
    renderToastHost();
    act(() => { showToast('加载中', 'loading'); });
    expect(screen.getByText('加载中')).toBeInTheDocument();
    const toast = screen.getByRole('alert');
    // loading 类型有旋转动画的 span
    expect(toast.querySelector('span[style]')).toBeTruthy();
  });

  test('info 类型应在 3 秒后自动消失', () => {
    renderToastHost();
    act(() => { showToast('临时消息', 'info'); });
    expect(screen.getByText('临时消息')).toBeInTheDocument();

    act(() => { jest.advanceTimersByTime(3000); });
    expect(screen.queryByText('临时消息')).not.toBeInTheDocument();
  });

  test('error 类型应在 5 秒后自动消失', () => {
    renderToastHost();
    act(() => { showToast('错误消息', 'error'); });
    expect(screen.getByText('错误消息')).toBeInTheDocument();

    act(() => { jest.advanceTimersByTime(3000); });
    expect(screen.getByText('错误消息')).toBeInTheDocument();

    act(() => { jest.advanceTimersByTime(2000); });
    expect(screen.queryByText('错误消息')).not.toBeInTheDocument();
  });

  test('loading 类型不应自动消失', () => {
    renderToastHost();
    act(() => { showToast('持续加载', 'loading'); });

    act(() => { jest.advanceTimersByTime(10000); });
    expect(screen.getByText('持续加载')).toBeInTheDocument();
  });

  test('点击关闭按钮应移除 toast', () => {
    renderToastHost();
    act(() => { showToast('可关闭', 'info'); });
    expect(screen.getByText('可关闭')).toBeInTheDocument();

    const closeBtn = screen.getByLabelText('关闭通知');
    act(() => { closeBtn.click(); });

    expect(screen.queryByText('可关闭')).not.toBeInTheDocument();
  });

  test('超过 5 条时移除最早的 toast', () => {
    renderToastHost();
    act(() => {
      for (let i = 1; i <= 6; i++) {
        showToast(`消息 ${i}`, 'loading'); // loading 不自动消失
      }
    });

    // 最早的一条应被移除
    expect(screen.queryByText('消息 1')).not.toBeInTheDocument();
    // 后 5 条应保留
    for (let i = 2; i <= 6; i++) {
      expect(screen.getByText(`消息 ${i}`)).toBeInTheDocument();
    }
  });

  test('无 toast 时不渲染容器', () => {
    const { container } = render(<ToastHost />);
    expect(container.firstChild).toBeNull();
  });

  test('toast 应有 role="alert"', () => {
    renderToastHost();
    act(() => { showToast('测试', 'info'); });
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  test('容器应有 aria-live="polite"', () => {
    renderToastHost();
    act(() => { showToast('测试', 'info'); });
    expect(screen.getByRole('region', { name: '通知' })).toHaveAttribute('aria-live', 'polite');
  });
});
