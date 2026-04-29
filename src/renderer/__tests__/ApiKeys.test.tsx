import '@testing-library/jest-dom';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './test-utils';
import ApiKeys from '../pages/ApiKeys';

describe('ApiKeys', () => {
  beforeEach(() => {
    window.electronAPI!.apiKeys.list = jest.fn(() => Promise.resolve([]));
    window.electronAPI!.apiKeys.add = jest.fn(() => Promise.resolve({
      id: 1, name: 'test-key', type: 'openai', createdAt: '2024-01-01', updatedAt: '2024-01-01',
    }));
    window.electronAPI!.apiKeys.delete = jest.fn(() => Promise.resolve(true));
  });

  test('加载状态显示骨架屏', () => {
    window.electronAPI!.apiKeys.list = jest.fn(() => new Promise(() => {}));
    renderWithProviders(<ApiKeys />);
    expect(document.querySelector('.skeleton')).toBeInTheDocument();
  });

  test('空列表显示占位提示', async () => {
    renderWithProviders(<ApiKeys />);
    await waitFor(() => {
      expect(screen.getByText('暂无 API Keys，点击上方按钮添加')).toBeInTheDocument();
    });
  });

  test('显示添加 API Key 按钮', async () => {
    renderWithProviders(<ApiKeys />);
    await waitFor(() => {
      expect(screen.getByText('添加 API Key')).toBeInTheDocument();
    });
  });

  test('点击添加按钮显示表单', async () => {
    renderWithProviders(<ApiKeys />);
    await waitFor(() => {
      expect(screen.getByText('添加 API Key')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('添加 API Key'));
    expect(screen.getByLabelText('名称')).toBeInTheDocument();
    expect(screen.getByLabelText('API Key')).toBeInTheDocument();
  });

  test('表单中类型切换后清空 key 输入', async () => {
    renderWithProviders(<ApiKeys />);
    await waitFor(() => {
      expect(screen.getByText('添加 API Key')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('添加 API Key'));
    // 输入 key
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'sk-test123456789012345678' } });
    // 切换类型到 anthropic
    fireEvent.change(screen.getByLabelText('类型'), { target: { value: 'anthropic' } });
    // key 应被清空
    expect((screen.getByLabelText('API Key') as HTMLInputElement).value).toBe('');
  });

  test('有 API Keys 时渲染列表', async () => {
    window.electronAPI!.apiKeys.list = jest.fn(() => Promise.resolve([
      { id: 1, name: 'My OpenAI Key', type: 'openai', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
    ]));

    renderWithProviders(<ApiKeys />);
    await waitFor(() => {
      expect(screen.getByText('My OpenAI Key')).toBeInTheDocument();
    });
    expect(screen.getByText('openai')).toBeInTheDocument();
    // key 被隐藏显示
    expect(screen.getByText('••••••••')).toBeInTheDocument();
  });

  test('有 key 时显示删除按钮', async () => {
    window.electronAPI!.apiKeys.list = jest.fn(() => Promise.resolve([
      { id: 1, name: 'Test Key', type: 'openai', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
    ]));

    renderWithProviders(<ApiKeys />);
    await waitFor(() => {
      expect(screen.getByLabelText('删除 Test Key')).toBeInTheDocument();
    });
  });

  test('点击删除弹出确认框', async () => {
    window.electronAPI!.apiKeys.list = jest.fn(() => Promise.resolve([
      { id: 1, name: 'Test Key', type: 'openai', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
    ]));

    renderWithProviders(<ApiKeys />);
    await waitFor(() => {
      expect(screen.getByLabelText('删除 Test Key')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('删除 Test Key'));
    expect(screen.getByText('删除 API Key')).toBeInTheDocument();
  });

  test('表格有 aria-label', async () => {
    renderWithProviders(<ApiKeys />);
    await waitFor(() => {
      expect(screen.getByLabelText('API Keys 列表')).toBeInTheDocument();
    });
  });

  test('添加表单有 aria-label', async () => {
    renderWithProviders(<ApiKeys />);
    await waitFor(() => {
      expect(screen.getByText('添加 API Key')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('添加 API Key'));
    expect(screen.getByLabelText('添加 API Key 表单')).toBeInTheDocument();
  });

  test('apiKeys.list 调用失败仍能渲染', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    window.electronAPI!.apiKeys.list = jest.fn(() => Promise.reject(new Error('IPC 错误')));

    renderWithProviders(<ApiKeys />);
    await waitFor(() => {
      expect(screen.getByText('API Keys 管理')).toBeInTheDocument();
    });

    consoleSpy.mockRestore();
  });
});
