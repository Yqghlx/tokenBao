import { lazy, Suspense, Component, ReactNode } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastContainer, useToast } from './components/Toast';
import './styles/pages.css';

// 懒加载页面组件，减小首屏体积
const ControlPanel = lazy(() => import('./pages/ControlPanel'));
const Monitor = lazy(() => import('./pages/Monitor'));
const Settings = lazy(() => import('./pages/Settings'));
const ApiKeys = lazy(() => import('./pages/ApiKeys'));
const History = lazy(() => import('./pages/History'));
const Optimization = lazy(() => import('./pages/Optimization'));
const Budget = lazy(() => import('./pages/Budget'));

function PageLoading() {
  return <div className="page"><p>加载中...</p></div>;
}

/**
 * 懒加载错误边界：捕获 chunk 加载失败（网络异常）并提供重试
 */
interface ChunkErrorState {
  hasError: boolean;
}

class ChunkErrorBoundary extends Component<{ children: ReactNode }, ChunkErrorState> {
  state: ChunkErrorState = { hasError: false };

  static getDerivedStateFromError(): ChunkErrorState {
    return { hasError: true };
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="page">
          <div className="info-panel">
            <h3>页面加载失败</h3>
            <p>网络异常导致页面资源加载失败，请重试。</p>
            <button className="btn-primary" onClick={this.handleRetry}>重新加载</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const { toasts, removeToast } = useToast();

  return (
    <ErrorBoundary>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <HashRouter>
        <ChunkErrorBoundary>
          <Suspense fallback={<PageLoading />}>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<Navigate to="/control" replace />} />
                <Route path="control" element={<ControlPanel />} />
                <Route path="monitor" element={<Monitor />} />
                <Route path="settings" element={<Settings />} />
                <Route path="api-keys" element={<ApiKeys />} />
                <Route path="history" element={<History />} />
                <Route path="optimization" element={<Optimization />} />
                <Route path="budget" element={<Budget />} />
              </Route>
            </Routes>
          </Suspense>
        </ChunkErrorBoundary>
      </HashRouter>
    </ErrorBoundary>
  );
}

export default App;
