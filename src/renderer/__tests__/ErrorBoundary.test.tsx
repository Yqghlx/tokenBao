import '@testing-library/jest-dom';
import { screen, render } from '@testing-library/react';
import ErrorBoundary from '../components/ErrorBoundary';

/** 模拟会抛出错误的子组件 */
function ThrowError({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('测试错误');
  }
  return <div>正常内容</div>;
}

describe('ErrorBoundary', () => {
  // 屏蔽 console.error 输出（React 错误边界会打印错误信息）
  const originalConsoleError = console.error;
  beforeEach(() => {
    console.error = jest.fn();
  });
  afterEach(() => {
    console.error = originalConsoleError;
  });

  test('正常子组件应正常渲染', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('正常内容')).toBeInTheDocument();
  });

  test('子组件抛错时显示错误 UI', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('出错了')).toBeInTheDocument();
    expect(screen.getByText(/页面发生了错误/)).toBeInTheDocument();
  });

  test('错误 UI 应有重试按钮', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('重试')).toBeInTheDocument();
  });

  test('错误 UI 应有返回首页按钮', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('返回首页')).toBeInTheDocument();
  });

  test('错误 UI 应有 role="alert"', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  test('children 变化时应重置错误状态', () => {
    const { rerender } = render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('出错了')).toBeInTheDocument();

    // 重新渲染正常子组件
    rerender(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('正常内容')).toBeInTheDocument();
    expect(screen.queryByText('出错了')).not.toBeInTheDocument();
  });
});
