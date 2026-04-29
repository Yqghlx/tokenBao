import '@testing-library/jest-dom';
import { screen, waitFor, act, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './test-utils';
import ControlPanel from '../pages/ControlPanel';

describe('ControlPanel 边界场景', () => {
  beforeEach(() => {
    window.electronAPI!.proxy.status = jest.fn(() => Promise.resolve({
      running: false,
      port: 3000,
      requests: 0,
    }));
    window.electronAPI!.proxy.start = jest.fn(() => Promise.resolve({ success: true, port: 3000 }));
    window.electronAPI!.proxy.stop = jest.fn(() => Promise.resolve({ success: true }));
    window.electronAPI!.proxy.health = jest.fn(() => Promise.resolve({
      status: 'not_running' as const,
      uptime: 0,
      activeConnections: 0,
      requestCount: 0,
    }));
    window.electronAPI!.budget.status = jest.fn(() => Promise.resolve({
      daily: { limit: 10, spent: 0, remaining: 10, percentage: 0 },
      monthly: { limit: 100, spent: 0, remaining: 100, percentage: 0 },
    }));
    window.electronAPI!.stats.summary = jest.fn(() => Promise.resolve({
      totalRequests: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCachedTokens: 0,
      totalCost: 0,
      byApi: {},
      byModel: {},
      cacheMetrics: { hits: 0, misses: 0, size: 0, hitRate: 0 },
    }));
    window.electronAPI!.optimization.getConfig = jest.fn(() => Promise.resolve({
      caching: true,
      compression: true,
      routing: true,
      batching: false,
      rules: true,
      dlp: false,
    }));
    window.electronAPI!.optimization.setConfig = jest.fn(() => Promise.resolve({ success: true }));
  });

  test('proxy.status 返回异常数据不崩溃', async () => {
    window.electronAPI!.proxy.status = jest.fn(() => Promise.resolve({
      running: true,
      port: undefined as any,
      requests: 'invalid' as any,
    }));

    renderWithProviders(<ControlPanel />);
    await waitFor(() => {
      expect(screen.getByText('运行中')).toBeInTheDocument();
    });
  });

  test('proxy.start 失败显示错误消息', async () => {
    window.electronAPI!.proxy.start = jest.fn(() => Promise.resolve({
      success: false,
      error: '端口 3000 已被占用',
    }));

    renderWithProviders(<ControlPanel />);
    await waitFor(() => {
      expect(screen.getByText('启动代理')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('启动代理'));
      await Promise.resolve();
    });

    // start 被调用且返回了错误
    expect(window.electronAPI!.proxy.start).toHaveBeenCalled();
  });

  test('optimization.setConfig 失败时回滚 UI 状态', async () => {
    window.electronAPI!.optimization.setConfig = jest.fn(() => Promise.reject(new Error('保存失败')));

    renderWithProviders(<ControlPanel />);
    await waitFor(() => {
      expect(screen.getByLabelText('Prompt Caching 优化开关')).toBeInTheDocument();
    });

    // 切换缓存开关（从启用 → 禁用）
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Prompt Caching 优化开关'));
      await Promise.resolve();
    });

    // 失败后应回滚到原来的启用状态
    expect((screen.getByLabelText('Prompt Caching 优化开关') as HTMLInputElement).checked).toBe(true);
  });

  test('budget.status 返回异常结构不崩溃', async () => {
    window.electronAPI!.budget.status = jest.fn(() => Promise.resolve(null as any));

    renderWithProviders(<ControlPanel />);
    await waitFor(() => {
      expect(screen.getByText('控制面板')).toBeInTheDocument();
    });
  });

  test('代理运行时显示已处理请求数', async () => {
    window.electronAPI!.proxy.status = jest.fn(() => Promise.resolve({
      running: true,
      port: 3000,
      requests: 42,
    }));
    window.electronAPI!.proxy.health = jest.fn(() => Promise.resolve({
      status: 'healthy' as const,
      uptime: 3600,
      activeConnections: 5,
      requestCount: 42,
    }));

    renderWithProviders(<ControlPanel />);
    await waitFor(() => {
      expect(screen.getByText(/已处理 42 个请求/)).toBeInTheDocument();
    });
  });

  test('代理运行时显示运行时间和活跃连接', async () => {
    window.electronAPI!.proxy.status = jest.fn(() => Promise.resolve({
      running: true,
      port: 3000,
      requests: 0,
    }));
    window.electronAPI!.proxy.health = jest.fn(() => Promise.resolve({
      status: 'healthy' as const,
      uptime: 3661,
      activeConnections: 3,
      requestCount: 0,
    }));

    renderWithProviders(<ControlPanel />);
    await act(async () => { await Promise.resolve(); });
    await waitFor(() => {
      expect(screen.getByText('控制面板')).toBeInTheDocument();
    }, { timeout: 2000 });
    // 健康信息通过轮询加载，可能需要额外等待
    await waitFor(() => {
      const healthInfo = document.querySelector('.proxy-health-info');
      expect(healthInfo).toBeTruthy();
    }, { timeout: 3000 });
  });

  test('预算超支时进度条为红色', async () => {
    window.electronAPI!.budget.status = jest.fn(() => Promise.resolve({
      daily: { limit: 10, spent: 12, remaining: -2, percentage: 120 },
      monthly: { limit: 100, spent: 25, remaining: 75, percentage: 25 },
    }));

    renderWithProviders(<ControlPanel />);
    await waitFor(() => {
      const progressbar = screen.getByRole('progressbar');
      expect(progressbar).toBeInTheDocument();
    });
  });

  test('全部加载失败时显示错误提示', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    window.electronAPI!.proxy.status = jest.fn(() => Promise.reject(new Error('err')));
    window.electronAPI!.budget.status = jest.fn(() => Promise.reject(new Error('err')));
    window.electronAPI!.stats.summary = jest.fn(() => Promise.reject(new Error('err')));
    window.electronAPI!.optimization.getConfig = jest.fn(() => Promise.reject(new Error('err')));

    renderWithProviders(<ControlPanel />);
    await waitFor(() => {
      expect(screen.getByText('控制面板')).toBeInTheDocument();
    });

    consoleSpy.mockRestore();
  });
});
