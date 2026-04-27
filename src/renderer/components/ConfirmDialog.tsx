import { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 通用确认对话框，替代 window.confirm
 * 支持键盘操作（Escape 取消、Enter 确认）和 ARIA 属性
 */
function ConfirmDialog({ open, title, message, confirmLabel = '确认', cancelLabel = '取消', danger, onConfirm, onCancel }: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // 打开时自动聚焦确认按钮，Escape 关闭
  useEffect(() => {
    if (open) {
      confirmRef.current?.focus();
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onCancel();
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="confirm-dialog">
        <h3 id="confirm-title">{title}</h3>
        <p>{message}</p>
        <div className="confirm-actions">
          <button className="btn-secondary btn-sm" onClick={onCancel}>{cancelLabel}</button>
          <button ref={confirmRef} className={`btn-primary btn-sm ${danger ? 'btn-danger' : ''}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
