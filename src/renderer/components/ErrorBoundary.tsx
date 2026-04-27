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

  handleRetry = (): void => {
    this.setState({ hasError: false, error: undefined });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const isDev = typeof __APP_VERSION__ === 'undefined';

      return (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          background: '#1a1a2e',
          color: '#eee',
          minHeight: '100vh'
        }}>
          <h1 style={{ color: '#ff6b6b', marginBottom: '20px' }}>出错了</h1>
          <p style={{ marginBottom: '20px', color: '#888' }}>
            页面发生了错误，请尝试刷新或联系支持。
          </p>
          {isDev && this.state.error && (
            <pre style={{
              textAlign: 'left',
              background: '#0f0f1a',
              padding: '16px',
              borderRadius: '8px',
              fontSize: '12px',
              color: '#ff6b6b',
              overflow: 'auto',
              maxWidth: '600px',
              margin: '0 auto 20px'
            }}>
              {this.state.error.message}
              {this.state.error.stack && '\n\n' + this.state.error.stack}
            </pre>
          )}
          <button
            onClick={this.handleRetry}
            style={{
              padding: '10px 20px',
              background: '#00d4ff',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            重试
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;