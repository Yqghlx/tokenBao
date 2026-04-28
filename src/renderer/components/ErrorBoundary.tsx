import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  /** 路由切换时 children 变化，重置错误状态让新页面正常渲染 */
  componentDidUpdate(prevProps: Props): void {
    if (this.state.hasError && prevProps.children !== this.props.children) {
      this.setState({ hasError: false, error: undefined });
    }
  }

  handleRetry = (): void => {
    // 状态损坏时仅清除 state 无法恢复，刷新页面是唯一可靠方案
    window.location.reload();
  };

  handleCopyError = (): void => {
    if (this.state.error) {
      const text = this.state.error.stack || this.state.error.message;
      // 异步回调前捕获按钮引用，避免焦点变化导致 activeElement 不正确
      const btn = document.activeElement as HTMLButtonElement | null;
      navigator.clipboard.writeText(text).then(
        () => {
          if (btn && btn.isConnected) {
            const original = btn.textContent || '';
            btn.textContent = '已复制';
            setTimeout(() => { if (btn.isConnected) btn.textContent = original; }, 1500);
          }
        },
        () => {
          // 剪贴板 API 不可用时回退到选中文本
          const pre = document.querySelector('.error-boundary-stack') as HTMLPreElement | null;
          if (pre) {
            const range = document.createRange();
            range.selectNodeContents(pre);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
          }
        }
      );
    }
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const isDev = process.env.NODE_ENV === 'development';

      return (
        <div className="error-boundary" role="alert">
          <h1 className="error-boundary-title">出错了</h1>
          <p className="error-boundary-desc">
            页面发生了错误，请尝试刷新或联系支持。
          </p>
          {isDev && this.state.error && (
            <pre className="error-boundary-stack">
              {this.state.error.message}
              {this.state.error.stack && '\n\n' + this.state.error.stack}
            </pre>
          )}
          <div className="error-boundary-actions">
            <button className="btn-primary" onClick={this.handleRetry}>
              重试
            </button>
            <button className="btn-secondary" onClick={() => { window.location.href = '#/'; }}>
              返回首页
            </button>
            {isDev && this.state.error && (
              <button className="btn-secondary" onClick={this.handleCopyError}>
                复制错误信息
              </button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
