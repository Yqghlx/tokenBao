import '@testing-library/jest-dom';
import { screen, fireEvent, render } from '@testing-library/react';
import ConfirmDialog from '../components/ConfirmDialog';

describe('ConfirmDialog', () => {
  const defaultProps = {
    open: true,
    title: '确认操作',
    message: '确定要执行此操作吗？',
    onConfirm: jest.fn(),
    onCancel: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('open=true 时应渲染对话框', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('确认操作')).toBeInTheDocument();
    expect(screen.getByText('确定要执行此操作吗？')).toBeInTheDocument();
  });

  test('open=false 时不应渲染', () => {
    render(<ConfirmDialog {...defaultProps} open={false} />);
    expect(screen.queryByText('确认操作')).not.toBeInTheDocument();
  });

  test('应显示确认和取消按钮', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('确认')).toBeInTheDocument();
    expect(screen.getByText('取消')).toBeInTheDocument();
  });

  test('自定义按钮文本', () => {
    render(<ConfirmDialog {...defaultProps} confirmLabel="删除" cancelLabel="返回" />);
    expect(screen.getByText('删除')).toBeInTheDocument();
    expect(screen.getByText('返回')).toBeInTheDocument();
  });

  test('点击确认按钮触发 onConfirm', () => {
    render(<ConfirmDialog {...defaultProps} />);
    fireEvent.click(screen.getByText('确认'));
    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
  });

  test('点击取消按钮触发 onCancel', () => {
    render(<ConfirmDialog {...defaultProps} />);
    fireEvent.click(screen.getByText('取消'));
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  test('点击背景遮罩触发 onCancel', () => {
    render(<ConfirmDialog {...defaultProps} />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  test('Escape 键触发 onCancel', () => {
    render(<ConfirmDialog {...defaultProps} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
  });

  test('Enter 键在确认按钮聚焦时触发 onConfirm', () => {
    render(<ConfirmDialog {...defaultProps} />);
    const confirmBtn = screen.getByText('确认');
    confirmBtn.focus();
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
  });

  test('Enter 键在取消按钮聚焦时不触发 onConfirm', () => {
    render(<ConfirmDialog {...defaultProps} />);
    const cancelBtn = screen.getByText('取消');
    cancelBtn.focus();
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(defaultProps.onConfirm).not.toHaveBeenCalled();
  });

  test('danger 模式下确认按钮应有 btn-danger 类名', () => {
    render(<ConfirmDialog {...defaultProps} danger />);
    const confirmBtn = screen.getByText('确认');
    expect(confirmBtn.className).toContain('btn-danger');
  });

  test('对话框应有 ARIA 属性', () => {
    render(<ConfirmDialog {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'confirm-title');
    expect(dialog).toHaveAttribute('aria-describedby', 'confirm-message');
  });

  test('message 支持 ReactNode', () => {
    render(
      <ConfirmDialog
        {...defaultProps}
        message={<div><p>自定义消息</p><ul><li>项目 1</li></ul></div>}
      />
    );
    expect(screen.getByText('自定义消息')).toBeInTheDocument();
    expect(screen.getByText('项目 1')).toBeInTheDocument();
  });

  test('焦点陷阱：Tab 在对话框内循环', () => {
    render(<ConfirmDialog {...defaultProps} />);
    const confirmBtn = screen.getByText('确认');
    const cancelBtn = screen.getByText('取消');

    // 确认按钮是最后一个 focusable 元素，Tab 应回到第一个
    confirmBtn.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    // 第一个 focusable 元素（取消按钮）应获得焦点
    expect(cancelBtn).toHaveFocus();

    // 在第一个元素上 Shift+Tab 应跳到最后一个
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(confirmBtn).toHaveFocus();
  });
});
