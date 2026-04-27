import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';

// 检测 Electron bridge 是否可用，不可用时显示友好错误提示
if (!window.electronAPI) {
  const root = document.getElementById('root')!;
  root.innerHTML = `
    <div style="padding:40px;text-align:center;font-family:-apple-system,sans-serif;background:#1a1a2e;color:#eee;min-height:100vh">
      <h1 style="color:#ff6b6b;margin-bottom:16px">应用启动失败</h1>
      <p style="color:#888;margin-bottom:24px">Electron 通信桥未加载，请尝试重新启动应用。</p>
      <button onclick="location.reload()" style="padding:10px 24px;background:#00d4ff;color:#1a1a2e;border:none;border-radius:6px;font-size:14px;cursor:pointer">
        重新加载
      </button>
    </div>`;
} else {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}