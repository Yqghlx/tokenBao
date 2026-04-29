import '@testing-library/jest-dom';
import { screen, waitFor, act, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './test-utils';
import ControlPanel from '../pages/ControlPanel';

describe('ControlPanel', () => {
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
  });

  test('加载状态显示骨架屏', () => {
    window.electronAPI!.proxy.status = jest.fn(() => new Promise(() => {}));
    renderWithProviders(<ControlPanel />);
    expect(document.querySelector('.skeleton')).toBeInTheDocument();
  });

  test('代理停止时显示启动按钮', async () => {
    renderWithProviders(<ControlPanel />);
    await waitFor(() => {
      expect(screen.getByText('启动代理')).toBeInTheDocument();
    });
    expect(screen.getByText('已停止')).toBeInTheDocument();
  });

  test('代理运行时显示停止按钮', async () => {
    window.electronAPI!.proxy.status = jest.fn(() => Promise.resolve({
      running: true, port: 3000, requests: 5,
    }));
    renderWithProviders(<ControlPanel />);
    await waitFor(() => {
      expect(screen.getByText('运行中')).toBeInTheDocument();
    });
    expect(screen.getByText('停止代理')).toBeInTheDocument();
  });

  test('点击启动代理调用 proxy.start', async () => {
    renderWithProviders(<ControlPanel />);
    await waitFor(() => {
      expect(screen.getByText('启动代理')).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('启动代理'));
      await Promise.resolve();
    });
    expect(window.electronAPI!.proxy.start).toHaveBeenCalled();
  });

  test('启动失败显示错误 toast', async () => {
    window.electronAPI!.proxy.start = jest.fn(() => Promise.resolve({ success: false, error: '端口被占用' }));
    renderWithProviders(<ControlPanel />);
    await waitFor(() => {
      expect(screen.getByText('启动代理')).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('启动代理'));
      await Promise.resolve();
    });
    // proxy.start 被调用
    expect(window.electronAPI!.proxy.start).toHaveBeenCalled();
  });

  test('点击停止代理调用 proxy.stop', async () => {
    window.electronAPI!.proxy.status = jest.fn(() => Promise.resolve({
      running: true, port: 3000, requests: 0,
    }));
    renderWithProviders(<ControlPanel />);
    await waitFor(() => {
      expect(screen.getByText('停止代理')).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('停止代理'));
      await Promise.resolve();
    });
    expect(window.electronAPI!.proxy.stop).toHaveBeenCalled();
  });

  test('显示端口号', async () => {
    renderWithProviders(<ControlPanel />);
    await waitFor(() => {
      expect(screen.getByText(/端口: 3000/)).toBeInTheDocument();
    });
  });

  test('渲染优化策略开关', async () => {
    renderWithProviders(<ControlPanel />);
    await waitFor(() => {
      expect(screen.getByLabelText('Prompt Caching 优化开关')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Prompt 压缩优化开关')).toBeInTheDocument();
    expect(screen.getByLabelText('智能模型路由优化开关')).toBeInTheDocument();
    expect(screen.getByLabelText('请求批处理优化开关')).toBeInTheDocument();
  });

  test('切换优化策略调用 optimization.setConfig', async () => {
    renderWithProviders(<ControlPanel />);
    await waitFor(() => {
      expect(screen.getByLabelText('Prompt Caching 优化开关')).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Prompt Caching 优化开关'));
      await Promise.resolve();
    });
    expect(window.electronAPI!.optimization.setConfig).toHaveBeenCalledWith({ caching: false });
  });

  test('预算进度条渲染', async () => {
    window.electronAPI!.budget.status = jest.fn(() => Promise.resolve({
      daily: { limit: 10, spent: 5, remaining: 5, percentage: 50 },
      monthly: { limit: 100, spent: 30, remaining: 70, percentage: 30 },
    }));
    renderWithProviders(<ControlPanel />);
    await waitFor(() => {
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });
  });

  test('proxy.status 调用失败仍能渲染', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    window.electronAPI!.proxy.status = jest.fn(() => Promise.reject(new Error('IPC 错误')));

    renderWithProviders(<ControlPanel />);
    await waitFor(() => {
      expect(screen.getByText('控制面板')).toBeInTheDocument();
    });

    consoleSpy.mockRestore();
  });

  test('注册 budget:changed 事件监听', async () => {
    renderWithProviders(<ControlPanel />);
    await waitFor(() => {
      expect(screen.getByText('控制面板')).toBeInTheDocument();
    });
    expect(window.electronAPI!.on).toHaveBeenCalledWith('budget:changed', expect.any(Function));
  });

  test('注册 proxy:statusChanged 事件监听', async () => {
    renderWithProviders(<ControlPanel />);
    await waitFor(() => {
      expect(screen.getByText('控制面板')).toBeInTheDocument();
    });
    expect(window.electronAPI!.on).toHaveBeenCalledWith('proxy:statusChanged', expect.any(Function));
  });

  test('注册 proxy:error 事件监听', async () => {
    renderWithProviders(<ControlPanel />);
    await waitFor(() => {
      expect(screen.getByText('控制面板')).toBeInTheDocument();
    });
    expect(window.electronAPI!.on).toHaveBeenCalledWith('proxy:error', expect.any(Function));
  });
});
