import '@testing-library/jest-dom';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from './test-utils';
import Monitor from '../pages/Monitor';

describe('Monitor', () => {
  beforeEach(() => {
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
  });

  test('加载状态显示骨架屏', () => {
    window.electronAPI!.stats.summary = jest.fn(() => new Promise(() => {}));
    renderWithProviders(<Monitor />);
    expect(document.querySelector('.skeleton')).toBeInTheDocument();
  });

  test('空数据显示占位提示', async () => {
    renderWithProviders(<Monitor />);
    await waitFor(() => {
      expect(screen.getByText('暂无统计数据')).toBeInTheDocument();
    });
  });

  test('有数据时渲染统计卡片', async () => {
    window.electronAPI!.stats.summary = jest.fn(() => Promise.resolve({
      totalRequests: 100,
      totalInputTokens: 5000,
      totalOutputTokens: 3000,
      totalCachedTokens: 1000,
      totalCost: 2.5,
      byApi: {},
      byModel: {},
      cacheMetrics: { hits: 50, misses: 50, size: 20, hitRate: 50 },
    }));

    renderWithProviders(<Monitor />);
    await waitFor(() => {
      expect(screen.getByText('总 Token 使用')).toBeInTheDocument();
    });
    expect(screen.getByText('8,000')).toBeInTheDocument(); // 5000+3000
    expect(screen.getByText('100')).toBeInTheDocument(); // totalRequests
    expect(screen.getByText('监控仪表盘')).toBeInTheDocument();
  });

  test('有缓存数据时显示缓存效果行', async () => {
    window.electronAPI!.stats.summary = jest.fn(() => Promise.resolve({
      totalRequests: 10,
      totalInputTokens: 1000,
      totalOutputTokens: 500,
      totalCachedTokens: 800,
      totalCost: 1.0,
      byApi: {},
      byModel: {},
      cacheMetrics: { hits: 80, misses: 20, size: 10, hitRate: 80 },
    }));

    renderWithProviders(<Monitor />);
    await waitFor(() => {
      expect(screen.getByText('Prompt Caching 效果')).toBeInTheDocument();
    });
    expect(screen.getByText('缓存命中率')).toBeInTheDocument();
  });

  test('无缓存数据时不显示缓存效果行', async () => {
    window.electronAPI!.stats.summary = jest.fn(() => Promise.resolve({
      totalRequests: 10,
      totalInputTokens: 1000,
      totalOutputTokens: 500,
      totalCachedTokens: 0,
      totalCost: 1.0,
      byApi: {},
      byModel: {},
      cacheMetrics: { hits: 0, misses: 0, size: 0, hitRate: 0 },
    }));

    renderWithProviders(<Monitor />);
    await waitFor(() => {
      expect(screen.getByText('总 Token 使用')).toBeInTheDocument();
    });
    expect(screen.queryByText('Prompt Caching 效果')).not.toBeInTheDocument();
  });

  test('显示 ROI 效率指标', async () => {
    window.electronAPI!.stats.summary = jest.fn(() => Promise.resolve({
      totalRequests: 10,
      totalInputTokens: 1000,
      totalOutputTokens: 500,
      totalCachedTokens: 500,
      totalCost: 1.0,
      byApi: {},
      byModel: {},
      cacheMetrics: { hits: 50, misses: 50, size: 10, hitRate: 50 },
    }));

    renderWithProviders(<Monitor />);
    await waitFor(() => {
      expect(screen.getByText('节省率')).toBeInTheDocument();
    });
    expect(screen.getByText('平均每请求成本')).toBeInTheDocument();
    expect(screen.getByText('平均每请求 Tokens')).toBeInTheDocument();
  });

  test('有模型数据时显示成本排名表', async () => {
    window.electronAPI!.stats.summary = jest.fn(() => Promise.resolve({
      totalRequests: 20,
      totalInputTokens: 2000,
      totalOutputTokens: 1000,
      totalCachedTokens: 0,
      totalCost: 3.0,
      byApi: {},
      byModel: {
        'gpt-4o': { requests: 10, tokens: 2000, cost: 2.0 },
        'gpt-4o-mini': { requests: 10, tokens: 1000, cost: 1.0 },
      },
      cacheMetrics: { hits: 0, misses: 0, size: 0, hitRate: 0 },
    }));

    renderWithProviders(<Monitor />);
    await waitFor(() => {
      expect(screen.getByText('模型成本排名')).toBeInTheDocument();
    });
    // 模型在排名表和详细统计中都出现
    expect(screen.getAllByText('gpt-4o').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('gpt-4o-mini').length).toBeGreaterThanOrEqual(2);
  });

  test('有数据时显示导出和刷新按钮', async () => {
    window.electronAPI!.stats.summary = jest.fn(() => Promise.resolve({
      totalRequests: 5,
      totalInputTokens: 100,
      totalOutputTokens: 50,
      totalCachedTokens: 0,
      totalCost: 0.5,
      byApi: {},
      byModel: {},
      cacheMetrics: { hits: 0, misses: 0, size: 0, hitRate: 0 },
    }));

    renderWithProviders(<Monitor />);
    await waitFor(() => {
      expect(screen.getByText('导出数据')).toBeInTheDocument();
    });
    expect(screen.getByText('刷新')).toBeInTheDocument();
  });

  test('无数据时不显示导出按钮', async () => {
    renderWithProviders(<Monitor />);
    await waitFor(() => {
      expect(screen.getByText('暂无统计数据')).toBeInTheDocument();
    });
    expect(screen.queryByText('导出数据')).not.toBeInTheDocument();
  });

  test('stats.summary 调用失败仍能渲染', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    window.electronAPI!.stats.summary = jest.fn(() => Promise.reject(new Error('网络错误')));

    renderWithProviders(<Monitor />);
    await waitFor(() => {
      expect(screen.getByText('监控仪表盘')).toBeInTheDocument();
    });

    consoleSpy.mockRestore();
  });
});
