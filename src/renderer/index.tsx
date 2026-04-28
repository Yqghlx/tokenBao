import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';

// 全局未捕获 Promise 拒绝处理，防止静默失败
window.addEventListener('unhandledrejection', (event) => {
  console.error('未捕获的 Promise 拒绝:', event.reason);
});

/**
 * 安全地显示 electronAPI 不可用错误页面
 * 使用 DOM API 而非 innerHTML 避免 XSS 风险
 */
function showBridgeError(): never {
  const root = document.getElementById('root')!;

  const container = document.createElement('div');
  container.style.cssText = 'padding:40px;text-align:center;font-family:-apple-system,sans-serif;background:#1a1a2e;color:#eee;min-height:100vh';

  const h1 = document.createElement('h1');
  h1.style.cssText = 'color:#ff6b6b;margin-bottom:16px';
  h1.textContent = '应用启动失败';
  container.appendChild(h1);

  const p = document.createElement('p');
  p.style.cssText = 'color:#888;margin-bottom:24px';
  p.textContent = 'Electron 通信桥未加载，请尝试重新启动应用。';
  container.appendChild(p);

  const button = document.createElement('button');
  button.style.cssText = 'padding:10px 24px;background:#00d4ff;color:#1a1a2e;border:none;border-radius:6px;font-size:14px;cursor:pointer';
  button.textContent = '重新加载';
  button.addEventListener('click', () => location.reload());
  container.appendChild(button);

  root.appendChild(container);
  throw new Error('electronAPI not available');
}

// 检测 Electron bridge 是否可用
if (!window.electronAPI) {
  showBridgeError();
} else {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
