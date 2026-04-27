import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastContainer, useToast } from './components/Toast';
import ControlPanel from './pages/ControlPanel';
import Monitor from './pages/Monitor';
import Settings from './pages/Settings';
import ApiKeys from './pages/ApiKeys';
import History from './pages/History';
import Optimization from './pages/Optimization';
import Budget from './pages/Budget';
import './styles/pages.css';

function App() {
  const { toasts, removeToast } = useToast();

  return (
    <ErrorBoundary>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <HashRouter>
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
      </HashRouter>
    </ErrorBoundary>
  );
}

export default App;