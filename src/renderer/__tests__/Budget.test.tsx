import '@testing-library/jest-dom';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './test-utils';
import Budget from '../pages/Budget';

describe('Budget', () => {
  beforeEach(() => {
    window.electronAPI!.budget.status = jest.fn(() => Promise.resolve({
      daily: { limit: 10, spent: 3, remaining: 7, percentage: 30 },
      monthly: { limit: 100, spent: 25, remaining: 75, percentage: 25 },
    }));
    window.electronAPI!.budget.set = jest.fn(() => Promise.resolve({
      type: 'daily', limit: 10, spent: 3,
    }));
    window.electronAPI!.budget.resetSpent = jest.fn(() => Promise.resolve({ success: true }));
  });

  test('加载状态显示骨架屏', () => {
    window.electronAPI!.budget.status = jest.fn(() => new Promise(() => {}));
    renderWithProviders(<Budget />);
    expect(document.querySelector('.skeleton')).toBeInTheDocument();
  });

  test('加载完成渲染日预算和月预算', async () => {
    renderWithProviders(<Budget />);
    await waitFor(() => {
      expect(screen.getByText('日预算')).toBeInTheDocument();
    });
    expect(screen.getByText('月预算')).toBeInTheDocument();
  });

  test('显示已用和限额金额', async () => {
    renderWithProviders(<Budget />);
    await waitFor(() => {
      expect(screen.getByText('日预算')).toBeInTheDocument();
    });
    // 金额值会出现多次（日预算 + 月预算），使用 getAllByText
    expect(screen.getAllByText('$3.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('$25.00').length).toBeGreaterThanOrEqual(1);
  });

  test('显示进度条', async () => {
    renderWithProviders(<Budget />);
    await waitFor(() => {
      expect(screen.getAllByRole('progressbar').length).toBeGreaterThanOrEqual(2);
    });
  });

  test('预算 80% 以上显示警告', async () => {
    window.electronAPI!.budget.status = jest.fn(() => Promise.resolve({
      daily: { limit: 10, spent: 9, remaining: 1, percentage: 90 },
      monthly: { limit: 100, spent: 25, remaining: 75, percentage: 25 },
    }));

    renderWithProviders(<Budget />);
    await waitFor(() => {
      expect(screen.getByText('预算即将用尽')).toBeInTheDocument();
    });
  });

  test('预算 100% 以上显示超支警告', async () => {
    window.electronAPI!.budget.status = jest.fn(() => Promise.resolve({
      daily: { limit: 10, spent: 12, remaining: -2, percentage: 120 },
      monthly: { limit: 100, spent: 25, remaining: 75, percentage: 25 },
    }));

    renderWithProviders(<Budget />);
    await waitFor(() => {
      expect(screen.getByText('预算已超支！')).toBeInTheDocument();
    });
  });

  test('显示刷新按钮', async () => {
    renderWithProviders(<Budget />);
    await waitFor(() => {
      expect(screen.getByText('刷新')).toBeInTheDocument();
    });
  });

  test('显示预算说明', async () => {
    renderWithProviders(<Budget />);
    await waitFor(() => {
      expect(screen.getByText('预算说明')).toBeInTheDocument();
    });
  });

  test('每个预算卡片有保存和重置按钮', async () => {
    renderWithProviders(<Budget />);
    await waitFor(() => {
      const saveButtons = screen.getAllByText('保存');
      expect(saveButtons.length).toBe(2); // 日预算 + 月预算
    });
    const resetButtons = screen.getAllByText('重置支出');
    expect(resetButtons.length).toBe(2);
  });

  test('点击重置支出弹出确认框', async () => {
    renderWithProviders(<Budget />);
    await waitFor(() => {
      // 2 个重置支出按钮（日预算 + 月预算）
      const buttons = screen.getAllByText('重置支出');
      expect(buttons.length).toBeGreaterThanOrEqual(2);
    });
    // 点击第一个重置支出按钮（日预算的）
    const resetButtons = screen.getAllByText('重置支出').filter(el => el.tagName === 'BUTTON');
    fireEvent.click(resetButtons[0]);
    // ConfirmDialog 弹出，显示确认消息
    await waitFor(() => {
      expect(screen.getByText('确定要重置日支出记录吗？此操作不可撤销。')).toBeInTheDocument();
    });
  });

  test('budget.status 调用失败仍能渲染', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    window.electronAPI!.budget.status = jest.fn(() => Promise.reject(new Error('IPC 错误')));

    renderWithProviders(<Budget />);
    await waitFor(() => {
      expect(screen.getByText('预算管理')).toBeInTheDocument();
    });

    consoleSpy.mockRestore();
  });
});
