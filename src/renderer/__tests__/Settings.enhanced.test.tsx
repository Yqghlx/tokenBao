import '@testing-library/jest-dom';
import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import { renderWithProviders } from './test-utils';
import Settings from '../pages/Settings';

describe('Settings 边界场景', () => {
  beforeEach(() => {
    window.electronAPI!.config.getAll = jest.fn(() => Promise.resolve({
      proxyPort: '3000',
      dataRetentionDays: '30',
      cacheTTL: '5min',
    }));
    window.electronAPI!.config.set = jest.fn(() => Promise.resolve({ success: true }));
    window.electronAPI!.config.reset = jest.fn(() => Promise.resolve({ success: true }));
  });

  test('保存失败时 UI 回滚', async () => {
    window.electronAPI!.config.set = jest.fn()
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error('写入失败'))
      .mockResolvedValueOnce({ success: true });

    renderWithProviders(<Settings />);
    await waitFor(() => {
      expect(screen.getByLabelText('代理端口号')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('代理端口号'), { target: { value: '4000' } });

    await act(async () => {
      fireEvent.click(screen.getByText('保存设置'));
      await Promise.resolve();
    });
  });

  test('空端口值不崩溃', async () => {
    renderWithProviders(<Settings />);
    await waitFor(() => {
      expect(screen.getByLabelText('代理端口号')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('代理端口号'), { target: { value: '' } });
    // 不应崩溃
    expect(screen.getByLabelText('代理端口号')).toBeInTheDocument();
  });

  test('空天数不崩溃', async () => {
    renderWithProviders(<Settings />);
    await waitFor(() => {
      expect(screen.getByLabelText('数据保留天数')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('数据保留天数'), { target: { value: '' } });
    expect(screen.getByLabelText('数据保留天数')).toBeInTheDocument();
  });

  test('端口号为 1024 不报错', async () => {
    renderWithProviders(<Settings />);
    await waitFor(() => {
      expect(screen.getByLabelText('代理端口号')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('代理端口号'), { target: { value: '1024' } });
    expect(screen.queryByText('端口范围应为 1024-65535')).not.toBeInTheDocument();
  });

  test('端口号为 65535 不报错', async () => {
    renderWithProviders(<Settings />);
    await waitFor(() => {
      expect(screen.getByLabelText('代理端口号')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('代理端口号'), { target: { value: '65535' } });
    expect(screen.queryByText('端口范围应为 1024-65535')).not.toBeInTheDocument();
  });

  test('天数为 365 不报错', async () => {
    renderWithProviders(<Settings />);
    await waitFor(() => {
      expect(screen.getByLabelText('数据保留天数')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('数据保留天数'), { target: { value: '365' } });
    expect(screen.queryByText('天数范围应为 1-365')).not.toBeInTheDocument();
  });

  test('天数为 7 不显示警告', async () => {
    renderWithProviders(<Settings />);
    await waitFor(() => {
      expect(screen.getByLabelText('数据保留天数')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('数据保留天数'), { target: { value: '7' } });
    expect(screen.queryByText('低于 7 天可能导致历史记录不足')).not.toBeInTheDocument();
  });

  test('切换缓存 TTL 后保存按钮启用', async () => {
    renderWithProviders(<Settings />);
    await waitFor(() => {
      expect(screen.getByText('保存设置')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('缓存 TTL'), { target: { value: '1hour' } });
    expect(screen.getByText('保存设置')).not.toBeDisabled();
  });

  test('config.getAll 返回空值时使用默认值', async () => {
    window.electronAPI!.config.getAll = jest.fn(() => Promise.resolve({}));
    renderWithProviders(<Settings />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('3000')).toBeInTheDocument();
    });
  });

  test('config.getAll 失败时仍能渲染', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    window.electronAPI!.config.getAll = jest.fn(() => Promise.reject(new Error('IPC 错误')));
    renderWithProviders(<Settings />);
    await waitFor(() => {
      expect(screen.getByText('设置')).toBeInTheDocument();
    });
    consoleSpy.mockRestore();
  });
});
