import { Outlet, NavLink } from 'react-router-dom';
import './Layout.css';

function Layout() {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>TokenBao</h1>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/control" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>⚡ 控制面板</NavLink>
          <NavLink to="/monitor" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>📊 监控仪表盘</NavLink>
          <NavLink to="/optimization" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>🔧 优化策略</NavLink>
          <NavLink to="/history" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>📋 请求历史</NavLink>
          <NavLink to="/api-keys" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>🔑 API Keys</NavLink>
          <NavLink to="/settings" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>⚙️ 设置</NavLink>
        </nav>
        <div className="sidebar-footer">
          <span>Token 节省工具</span>
          <span style={{ display: 'block', marginTop: '4px', fontSize: '11px', color: '#555' }}>
            v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'}
          </span>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;