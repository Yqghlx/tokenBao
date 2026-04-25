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
          <NavLink to="/control" className="nav-link">控制面板</NavLink>
          <NavLink to="/monitor" className="nav-link">监控仪表盘</NavLink>
          <NavLink to="/optimization" className="nav-link">优化策略</NavLink>
          <NavLink to="/history" className="nav-link">请求历史</NavLink>
          <NavLink to="/api-keys" className="nav-link">API Keys</NavLink>
          <NavLink to="/settings" className="nav-link">设置</NavLink>
        </nav>
        <div className="sidebar-footer">
          <span>Token 节省工具</span>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;