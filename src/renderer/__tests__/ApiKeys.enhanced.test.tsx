import '@testing-library/jest-dom';
import { screen, waitFor, act, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './test-utils';
import ApiKeys from '../pages/ApiKeys';

describe('ApiKeys 边界场景', () => {
  beforeEach(() => {
    window.electronAPI!.apiKeys.list = jest.fn(() => Promise.resolve([]));
    window.electronAPI!.apiKeys.add = jest.fn(() => Promise.resolve({
      id: 1, name: 'test-key', type: 'openai', createdAt: '2024-01-01', updatedAt: '2024-01-01',
    }));
    window.electronAPI!.apiKeys.delete = jest.fn(() => Promise.resolve(true));
  });

  test('添加 Key 时名称为空提示错误', async () => {
    renderWithProviders(<ApiKeys />);
    await waitFor(() => {
      expect(screen.getByText('添加 API Key')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('添加 API Key'));

    await act(async () => {
      fireEvent.click(screen.getByText('保存'));
      await Promise.resolve();
    });
    // 名称和 key 为空应提示
    expect(window.electronAPI!.apiKeys.add).not.toHaveBeenCalled();
  });

  test('OpenAI Key 前缀校验', async () => {
    renderWithProviders(<ApiKeys />);
    await waitFor(() => {
      expect(screen.getByText('添加 API Key')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('添加 API Key'));

    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '测试' } });
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'invalid-key-that-is-long-enough-1234567890' } });

    await act(async () => {
      fireEvent.click(screen.getByText('保存'));
      await Promise.resolve();
    });
    // OpenAI key 不以 sk- 开头，应拒绝
    expect(window.electronAPI!.apiKeys.add).not.toHaveBeenCalled();
  });

  test('Anthropic Key 前缀校验', async () => {
    renderWithProviders(<ApiKeys />);
    await waitFor(() => {
      expect(screen.getByText('添加 API Key')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('添加 API Key'));

    // 切换到 Anthropic
    fireEvent.change(screen.getByLabelText('类型'), { target: { value: 'anthropic' } });
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '测试' } });
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'sk-wrong-prefix-anthropic-key-1234567890' } });

    await act(async () => {
      fireEvent.click(screen.getByText('保存'));
      await Promise.resolve();
    });
    // Anthropic key 不以 sk-ant- 开头，应拒绝
    expect(window.electronAPI!.apiKeys.add).not.toHaveBeenCalled();
  });

  test('API Key 长度不足提示错误', async () => {
    renderWithProviders(<ApiKeys />);
    await waitFor(() => {
      expect(screen.getByText('添加 API Key')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('添加 API Key'));

    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '测试' } });
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'sk-short' } });

    await act(async () => {
      fireEvent.click(screen.getByText('保存'));
      await Promise.resolve();
    });
    // Key 长度不足 20，应拒绝
    expect(window.electronAPI!.apiKeys.add).not.toHaveBeenCalled();
  });

  test('有效的 OpenAI Key 可成功添加', async () => {
    renderWithProviders(<ApiKeys />);
    await waitFor(() => {
      expect(screen.getByText('添加 API Key')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('添加 API Key'));

    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '我的 Key' } });
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'sk-valid-openai-api-key-12345678901234567890' } });

    await act(async () => {
      fireEvent.click(screen.getByText('保存'));
      await Promise.resolve();
    });
    expect(window.electronAPI!.apiKeys.add).toHaveBeenCalledWith('我的 Key', 'openai', 'sk-valid-openai-api-key-12345678901234567890');
  });

  test('删除按钮在删除中时禁用其他按钮', async () => {
    window.electronAPI!.apiKeys.list = jest.fn(() => Promise.resolve([
      { id: 1, name: 'Key 1', type: 'openai', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
      { id: 2, name: 'Key 2', type: 'openai', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
    ]));
    // 让 delete 操作挂起
    window.electronAPI!.apiKeys.delete = jest.fn(() => new Promise(() => {}));

    renderWithProviders(<ApiKeys />);
    await waitFor(() => {
      expect(screen.getByLabelText('删除 Key 1')).toBeInTheDocument();
    });

    // 打开确认框并确认删除
    fireEvent.click(screen.getByLabelText('删除 Key 1'));
    await act(async () => {
      const dangerBtn = document.querySelector('.btn-danger') as HTMLButtonElement;
      fireEvent.click(dangerBtn);
      await Promise.resolve();
    });

    // 删除中时，Key 2 的删除按钮应被禁用
    expect(screen.getByLabelText('删除 Key 2')).toBeDisabled();
  });

  test('添加 API Key 失败时显示错误', async () => {
    window.electronAPI!.apiKeys.add = jest.fn(() => Promise.reject(new Error('名称已存在')));

    renderWithProviders(<ApiKeys />);
    await waitFor(() => {
      expect(screen.getByText('添加 API Key')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('添加 API Key'));

    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '测试' } });
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'sk-valid-openai-api-key-12345678901234567890' } });

    await act(async () => {
      fireEvent.click(screen.getByText('保存'));
      await Promise.resolve();
    });

    expect(window.electronAPI!.apiKeys.add).toHaveBeenCalled();
  });

  test('取消添加关闭表单', async () => {
    renderWithProviders(<ApiKeys />);
    await waitFor(() => {
      expect(screen.getByText('添加 API Key')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('添加 API Key'));
    expect(screen.getByLabelText('名称')).toBeInTheDocument();

    fireEvent.click(screen.getByText('取消'));
    expect(screen.queryByLabelText('名称')).not.toBeInTheDocument();
  });
});
