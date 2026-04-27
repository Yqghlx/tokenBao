import { lazy, Suspense } from 'react';
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

function App() {
  const { toasts, removeToast } = useToast();

  return (
    <ErrorBoundary>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <HashRouter>
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
      </HashRouter>
    </ErrorBoundary>
  );
}

export default App;
