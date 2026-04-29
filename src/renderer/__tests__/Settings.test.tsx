import '@testing-library/jest-dom';
import { screen, fireEvent, waitFor, act } from '@testing-library/react';
import { renderWithProviders } from './test-utils';
import Settings from '../pages/Settings';

describe('Settings', () => {
  beforeEach(() => {
    // 重置 mock 返回值
    window.electronAPI!.config.getAll = jest.fn(() => Promise.resolve({
      proxyPort: '3000',
      dataRetentionDays: '30',
      cacheTTL: '5min',
    }));
    window.electronAPI!.config.set = jest.fn(() => Promise.resolve({ success: true }));
    window.electronAPI!.config.reset = jest.fn(() => Promise.resolve({ success: true }));
  });

  test('加载状态显示骨架屏', () => {
    // 让 getAll 永不 resolve，保持 loading 状态
    window.electronAPI!.config.getAll = jest.fn(() => new Promise(() => {}));
    renderWithProviders(<Settings />);
    // 骨架屏有 skeleton 类名
    expect(document.querySelector('.skeleton')).toBeInTheDocument();
  });

  test('加载完成渲染表单', async () => {
    renderWithProviders(<Settings />);
    await waitFor(() => {
      expect(screen.getByLabelText('代理端口号')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('数据保留天数')).toBeInTheDocument();
    expect(screen.getByLabelText('缓存 TTL')).toBeInTheDocument();
  });

  test('表单显示初始值', async () => {
    renderWithProviders(<Settings />);
    await waitFor(() => {
      expect(screen.getByLabelText('代理端口号')).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('3000')).toBeInTheDocument();
    expect(screen.getByDisplayValue('30')).toBeInTheDocument();
    // select 的值通过 value 属性匹配
    const cacheSelect = screen.getByLabelText('缓存 TTL') as HTMLSelectElement;
    expect(cacheSelect.value).toBe('5min');
  });

  test('端口 <1024 显示错误', async () => {
    renderWithProviders(<Settings />);
    await waitFor(() => {
      expect(screen.getByLabelText('代理端口号')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('代理端口号'), { target: { value: '80' } });
    expect(screen.getByText('端口范围应为 1024-65535')).toBeInTheDocument();
  });

  test('端口 >65535 显示错误', async () => {
    renderWithProviders(<Settings />);
    await waitFor(() => {
      expect(screen.getByLabelText('代理端口号')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('代理端口号'), { target: { value: '99999' } });
    expect(screen.getByText('端口范围应为 1024-65535')).toBeInTheDocument();
  });

  test('天数 <1 显示错误', async () => {
    renderWithProviders(<Settings />);
    await waitFor(() => {
      expect(screen.getByLabelText('数据保留天数')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('数据保留天数'), { target: { value: '0' } });
    expect(screen.getByText('天数范围应为 1-365')).toBeInTheDocument();
  });

  test('天数 >365 显示错误', async () => {
    renderWithProviders(<Settings />);
    await waitFor(() => {
      expect(screen.getByLabelText('数据保留天数')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('数据保留天数'), { target: { value: '400' } });
    expect(screen.getByText('天数范围应为 1-365')).toBeInTheDocument();
  });

  test('天数 <7 显示警告', async () => {
    renderWithProviders(<Settings />);
    await waitFor(() => {
      expect(screen.getByLabelText('数据保留天数')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('数据保留天数'), { target: { value: '3' } });
    expect(screen.getByText('低于 7 天可能导致历史记录不足')).toBeInTheDocument();
  });

  test('未修改时保存按钮禁用', async () => {
    renderWithProviders(<Settings />);
    await waitFor(() => {
      expect(screen.getByText('保存设置')).toBeInTheDocument();
    });
    expect(screen.getByText('保存设置')).toBeDisabled();
  });

  test('修改后保存按钮启用', async () => {
    renderWithProviders(<Settings />);
    await waitFor(() => {
      expect(screen.getByLabelText('代理端口号')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('代理端口号'), { target: { value: '4000' } });
    expect(screen.getByText('保存设置')).not.toBeDisabled();
  });

  test('保存成功调用 config.set 并显示 toast', async () => {
    renderWithProviders(<Settings />);
    await waitFor(() => {
      expect(screen.getByLabelText('代理端口号')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('代理端口号'), { target: { value: '4000' } });

    await act(async () => {
      fireEvent.click(screen.getByText('保存设置'));
      await Promise.resolve();
    });

    expect(window.electronAPI!.config.set).toHaveBeenCalledWith('proxyPort', '4000');
  });

  test('点击恢复默认弹出确认框', async () => {
    renderWithProviders(<Settings />);
    await waitFor(() => {
      expect(screen.getByText('恢复默认')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('恢复默认'));
    expect(screen.getByText('恢复默认设置')).toBeInTheDocument();
  });

  test('确认恢复默认调用 config.reset', async () => {
    renderWithProviders(<Settings />);
    await waitFor(() => {
      expect(screen.getByText('恢复默认')).toBeInTheDocument();
    });
    // 点击页面的恢复默认按钮（btn-secondary），打开确认框
    const pageButton = document.querySelector('.btn-secondary') as HTMLButtonElement;
    fireEvent.click(pageButton);
    // 确认框打开后，点击确认框中的恢复默认按钮（btn-danger）
    await act(async () => {
      const dangerButton = document.querySelector('.btn-danger') as HTMLButtonElement;
      fireEvent.click(dangerButton);
      await Promise.resolve();
    });
    expect(window.electronAPI!.config.reset).toHaveBeenCalled();
  });

  test('有错误时保存按钮禁用', async () => {
    renderWithProviders(<Settings />);
    await waitFor(() => {
      expect(screen.getByLabelText('代理端口号')).toBeInTheDocument();
    });
    // 输入无效端口触发错误
    fireEvent.change(screen.getByLabelText('代理端口号'), { target: { value: '80' } });
    // 保存按钮应被禁用
    expect(screen.getByText('保存设置')).toBeDisabled();
  });
});
