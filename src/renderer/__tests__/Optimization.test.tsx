import '@testing-library/jest-dom';
import { screen, waitFor, act, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './test-utils';
import Optimization from '../pages/Optimization';

describe('Optimization', () => {
  beforeEach(() => {
    window.electronAPI!.optimization.getConfig = jest.fn(() => Promise.resolve({
      caching: true,
      compression: true,
      routing: true,
      batching: false,
      rules: true,
      dlp: false,
    }));
    window.electronAPI!.config.get = jest.fn(() => Promise.resolve('5min'));
    window.electronAPI!.rules.list = jest.fn(() => Promise.resolve([]));
    window.electronAPI!.dlp.getRules = jest.fn(() => Promise.resolve([]));
    window.electronAPI!.optimization.setConfig = jest.fn(() => Promise.resolve({ success: true }));
    window.electronAPI!.rules.add = jest.fn(() => Promise.resolve({ success: true }));
    window.electronAPI!.rules.update = jest.fn(() => Promise.resolve({ success: true }));
    window.electronAPI!.rules.delete = jest.fn(() => Promise.resolve({ success: true }));
    window.electronAPI!.config.set = jest.fn(() => Promise.resolve({ success: true }));
  });

  test('加载状态显示骨架屏', () => {
    window.electronAPI!.optimization.getConfig = jest.fn(() => new Promise(() => {}));
    renderWithProviders(<Optimization />);
    expect(document.querySelector('.skeleton')).toBeInTheDocument();
  });

  test('加载完成显示优化策略配置', async () => {
    renderWithProviders(<Optimization />);
    // 等待 loadConfig 的 Promise.allSettled 完成
    await act(async () => { await Promise.resolve(); });
    await waitFor(() => {
      expect(screen.getByText('优化策略配置')).toBeInTheDocument();
    });
    // 标题文本
    expect(screen.getByText('Prompt Caching', { selector: 'h3' })).toBeInTheDocument();
    expect(screen.getByText('Prompt 压缩', { selector: 'h3' })).toBeInTheDocument();
    expect(screen.getByText('智能模型路由', { selector: 'h3' })).toBeInTheDocument();
  });

  test('渲染优化开关', async () => {
    renderWithProviders(<Optimization />);
    await waitFor(() => {
      expect(screen.getByLabelText('启用 Prompt Caching')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('启用 Prompt 压缩')).toBeInTheDocument();
    expect(screen.getByLabelText('启用智能模型路由')).toBeInTheDocument();
  });

  test('切换缓存开关调用 setConfig', async () => {
    renderWithProviders(<Optimization />);
    await waitFor(() => {
      expect(screen.getByLabelText('启用 Prompt Caching')).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText('启用 Prompt Caching'));
      await Promise.resolve();
    });
    expect(window.electronAPI!.optimization.setConfig).toHaveBeenCalledWith({ caching: false });
  });

  test('缓存 TTL 下拉渲染', async () => {
    renderWithProviders(<Optimization />);
    await waitFor(() => {
      expect(screen.getByLabelText('缓存 TTL')).toBeInTheDocument();
    });
    const select = screen.getByLabelText('缓存 TTL') as HTMLSelectElement;
    expect(select.value).toBe('5min');
  });

  test('显示自定义替换规则区域', async () => {
    renderWithProviders(<Optimization />);
    await waitFor(() => {
      expect(screen.getByText('自定义替换规则')).toBeInTheDocument();
    });
    expect(screen.getByText('添加规则')).toBeInTheDocument();
  });

  test('点击添加规则显示规则表单', async () => {
    renderWithProviders(<Optimization />);
    await waitFor(() => {
      expect(screen.getByText('添加规则')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('添加规则'));
    expect(screen.getByLabelText('规则名称')).toBeInTheDocument();
    expect(screen.getByLabelText('正则表达式')).toBeInTheDocument();
    expect(screen.getByLabelText('替换文本')).toBeInTheDocument();
  });

  test('无效正则表达式显示错误', async () => {
    renderWithProviders(<Optimization />);
    await waitFor(() => {
      expect(screen.getByText('添加规则')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('添加规则'));
    fireEvent.change(screen.getByLabelText('正则表达式'), { target: { value: '[invalid' } });
    expect(screen.getByText('无效的正则表达式')).toBeInTheDocument();
  });

  test('渲染已有规则列表', async () => {
    window.electronAPI!.rules.list = jest.fn(() => Promise.resolve([
      { id: 1, name: '移除问候', type: 'replace', pattern: '/hello/gi', replacement: '', enabled: true, priority: 100 },
    ]));

    renderWithProviders(<Optimization />);
    await waitFor(() => {
      expect(screen.getByText('移除问候')).toBeInTheDocument();
    });
    expect(screen.getByText('/hello/gi')).toBeInTheDocument();
  });

  test('渲染 DLP 区域', async () => {
    renderWithProviders(<Optimization />);
    await waitFor(() => {
      expect(screen.getByText('敏感数据脱敏 (DLP)')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('启用敏感数据脱敏')).toBeInTheDocument();
  });

  test('getConfig 失败仍能渲染', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    window.electronAPI!.optimization.getConfig = jest.fn(() => Promise.reject(new Error('IPC 错误')));

    renderWithProviders(<Optimization />);
    await waitFor(() => {
      expect(screen.getByText('优化策略配置')).toBeInTheDocument();
    });

    consoleSpy.mockRestore();
  });
});
