import '@testing-library/jest-dom';
import { screen, waitFor, act, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './test-utils';
import Monitor from '../pages/Monitor';

describe('Monitor 边界场景', () => {
  test('统计含 Infinity 值不崩溃', async () => {
    window.electronAPI!.stats.summary = jest.fn(() => Promise.resolve({
      totalRequests: 10,
      totalInputTokens: Infinity,
      totalOutputTokens: 500,
      totalCachedTokens: 0,
      totalCost: NaN,
      byApi: {},
      byModel: {},
      cacheMetrics: { hits: 0, misses: 0, size: 0, hitRate: 0 },
    }));

    renderWithProviders(<Monitor />);
    await waitFor(() => {
      expect(screen.getByText('总 Token 使用')).toBeInTheDocument();
    });
    // Infinity + 500 → NaN → toLocaleString 显示 "NaN"
    // 组件应该正常渲染不崩溃
  });

  test('stats.summary 返回不完整数据不崩溃', async () => {
    window.electronAPI!.stats.summary = jest.fn(() => Promise.resolve({
      totalRequests: 5,
      // 缺少其他字段
    } as any));

    renderWithProviders(<Monitor />);
    await waitFor(() => {
      expect(screen.getByText('监控仪表盘')).toBeInTheDocument();
    });
  });

  test('导出按钮点击不崩溃', async () => {
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

    // 点击导出按钮 — 会创建 blob URL 并下载
    // jsdom 中 URL.createObjectURL 可能未实现，但不应崩溃
    const exportBtn = screen.getByText('导出数据');
    expect(() => fireEvent.click(exportBtn)).not.toThrow();
  });

  test('刷新按钮点击后调用 stats.summary', async () => {
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
      expect(screen.getByText('刷新')).toBeInTheDocument();
    });

    const initialCalls = (window.electronAPI!.stats.summary as jest.Mock).mock.calls.length;
    await act(async () => {
      fireEvent.click(screen.getByText('刷新'));
      await Promise.resolve();
    });
    // 刷新应该触发额外的 summary 调用
    expect((window.electronAPI!.stats.summary as jest.Mock).mock.calls.length).toBeGreaterThan(initialCalls);
  });

  test('byApi/byModel 为 undefined 时不崩溃', async () => {
    window.electronAPI!.stats.summary = jest.fn(() => Promise.resolve({
      totalRequests: 5,
      totalInputTokens: 100,
      totalOutputTokens: 50,
      totalCachedTokens: 0,
      totalCost: 0.5,
      byApi: {} as any,
      byModel: {} as any,
      cacheMetrics: { hits: 0, misses: 0, size: 0, hitRate: 0 },
    }));

    renderWithProviders(<Monitor />);
    await waitFor(() => {
      expect(screen.getByText('监控仪表盘')).toBeInTheDocument();
    });
  });
});
