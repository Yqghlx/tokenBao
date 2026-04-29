import '@testing-library/jest-dom';
import { screen } from '@testing-library/react';
import { render } from '@testing-library/react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from '../components/Layout';

function renderLayout() {
  return render(
    <HashRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/control" replace />} />
          <Route path="control" element={<div>控制面板内容</div>} />
          <Route path="monitor" element={<div>监控仪表盘内容</div>} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

describe('Layout', () => {
  test('渲染应用标题', () => {
    renderLayout();
    expect(screen.getByText('TokenBao')).toBeInTheDocument();
  });

  test('渲染侧边栏导航', () => {
    renderLayout();
    expect(screen.getByRole('navigation', { name: '主导航' })).toBeInTheDocument();
  });

  test('渲染所有导航链接', () => {
    renderLayout();
    expect(screen.getByText('控制面板')).toBeInTheDocument();
    expect(screen.getByText('监控仪表盘')).toBeInTheDocument();
    expect(screen.getByText('优化策略')).toBeInTheDocument();
    expect(screen.getByText('请求历史')).toBeInTheDocument();
    expect(screen.getByText('预算管理')).toBeInTheDocument();
    expect(screen.getByText('API Keys')).toBeInTheDocument();
    expect(screen.getByText('设置')).toBeInTheDocument();
  });

  test('渲染 skip-nav 链接', () => {
    renderLayout();
    expect(screen.getByText('跳到主要内容')).toBeInTheDocument();
  });

  test('渲染版本号', () => {
    renderLayout();
    expect(screen.getByText(/v1\.1\.3/)).toBeInTheDocument();
  });

  test('渲染侧边栏页脚', () => {
    renderLayout();
    expect(screen.getByText('Token 节省工具')).toBeInTheDocument();
  });

  test('主内容区域存在且有 id', () => {
    renderLayout();
    const main = screen.getByRole('main');
    expect(main).toBeInTheDocument();
    expect(main).toHaveAttribute('id', 'main-content');
  });

  test('导航链接数量为 7', () => {
    renderLayout();
    const navLinks = screen.getAllByRole('link').filter(
      link => link.classList.contains('nav-link')
    );
    expect(navLinks.length).toBe(7);
  });
});
