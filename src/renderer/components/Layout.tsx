import { memo } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import './Layout.css';

const navItems = [
  { to: '/control', label: '控制面板' },
  { to: '/monitor', label: '监控仪表盘' },
  { to: '/optimization', label: '优化策略' },
  { to: '/history', label: '请求历史' },
  { to: '/budget', label: '预算管理' },
  { to: '/api-keys', label: 'API Keys' },
  { to: '/settings', label: '设置' },
];

const Layout = memo(function Layout() {
  return (
    <div className="layout">
      {/* 跳过导航链接，键盘用户可快速访问主内容 */}
      <a href="#main-content" className="skip-nav">跳到主要内容</a>
      <aside className="sidebar" role="navigation" aria-label="主导航">
        <div className="sidebar-header">
          <h1>TokenBao</h1>
        </div>
        <nav className="sidebar-nav" aria-label="页面导航">
          <ul role="list">
            {navItems.map(({ to, label }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                  end
                >
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <footer className="sidebar-footer">
          <span>Token 节省工具</span>
          <span className="sidebar-version">
            v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'}
          </span>
        </footer>
      </aside>
      <main className="main-content" role="main" id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
});

export default Layout; // memo 已在定义处包装
