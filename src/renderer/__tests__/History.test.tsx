import '@testing-library/jest-dom';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './test-utils';
import History from '../pages/History';

const mockRecords = Array.from({ length: 5 }, (_, i) => ({
  id: i + 1,
  apiType: 'openai',
  model: 'gpt-4o',
  inputTokens: 100 * (i + 1),
  outputTokens: 50 * (i + 1),
  cachedTokens: 0,
  cost: 0.01 * (i + 1),
  cached: false,
  timestamp: new Date(2024, 0, i + 1).toISOString(),
}));

describe('History', () => {
  beforeEach(() => {
    window.electronAPI!.history.list = jest.fn(() => Promise.resolve(mockRecords));
    window.electronAPI!.history.count = jest.fn(() => Promise.resolve(5));
    window.electronAPI!.history.clear = jest.fn(() => Promise.resolve({ success: true }));
  });

  test('加载状态显示骨架屏', () => {
    window.electronAPI!.history.list = jest.fn(() => new Promise(() => {}));
    renderWithProviders(<History />);
    expect(document.querySelector('.skeleton')).toBeInTheDocument();
  });

  test('空数据显示占位提示', async () => {
    window.electronAPI!.history.list = jest.fn(() => Promise.resolve([]));
    window.electronAPI!.history.count = jest.fn(() => Promise.resolve(0));

    renderWithProviders(<History />);
    await waitFor(() => {
      expect(screen.getByText('暂无请求记录')).toBeInTheDocument();
    });
  });

  test('有数据时渲染表格', async () => {
    renderWithProviders(<History />);
    await waitFor(() => {
      // 多条记录都有 gpt-4o，使用 getAllByText
      expect(screen.getAllByText('gpt-4o').length).toBeGreaterThan(0);
    });
    // 表头
    expect(screen.getByText('时间')).toBeInTheDocument();
    expect(screen.getByText('API')).toBeInTheDocument();
    expect(screen.getByText('模型')).toBeInTheDocument();
  });

  test('显示搜索输入框', async () => {
    renderWithProviders(<History />);
    await waitFor(() => {
      expect(screen.getByLabelText('搜索历史记录')).toBeInTheDocument();
    });
  });

  test('显示 API 类型筛选下拉', async () => {
    renderWithProviders(<History />);
    await waitFor(() => {
      expect(screen.getByLabelText('按 API 类型筛选')).toBeInTheDocument();
    });
  });

  test('显示导出 CSV 按钮', async () => {
    renderWithProviders(<History />);
    await waitFor(() => {
      expect(screen.getByText('导出 CSV')).toBeInTheDocument();
    });
  });

  test('显示清除历史按钮', async () => {
    renderWithProviders(<History />);
    await waitFor(() => {
      expect(screen.getByText('清除历史')).toBeInTheDocument();
    });
  });

  test('点击清除历史弹出确认框', async () => {
    renderWithProviders(<History />);
    await waitFor(() => {
      expect(screen.getByText('清除历史')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('清除历史'));
    expect(screen.getByText('清除历史记录')).toBeInTheDocument();
  });

  test('显示总记录数', async () => {
    renderWithProviders(<History />);
    await waitFor(() => {
      expect(screen.getByText(/共 5 条记录/)).toBeInTheDocument();
    });
  });

  test('history.list 调用失败仍能渲染', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    window.electronAPI!.history.list = jest.fn(() => Promise.reject(new Error('IPC 错误')));

    renderWithProviders(<History />);
    await waitFor(() => {
      expect(screen.getByText('请求历史')).toBeInTheDocument();
    });

    consoleSpy.mockRestore();
  });

  test('分页在多页数据时显示', async () => {
    const manyRecords = Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      apiType: 'openai',
      model: 'gpt-4o',
      inputTokens: 100,
      outputTokens: 50,
      cachedTokens: 0,
      cost: 0.01,
      cached: false,
      timestamp: new Date(2024, 0, 1).toISOString(),
    }));
    window.electronAPI!.history.list = jest.fn(() => Promise.resolve(manyRecords));
    window.electronAPI!.history.count = jest.fn(() => Promise.resolve(25));

    renderWithProviders(<History />);
    await waitFor(() => {
      expect(screen.getByText('下一页')).toBeInTheDocument();
    });
    expect(screen.getByText('上一页')).toBeInTheDocument();
  });

  test('表格有 aria-label', async () => {
    renderWithProviders(<History />);
    await waitFor(() => {
      expect(screen.getByLabelText('请求历史记录')).toBeInTheDocument();
    });
  });
});
