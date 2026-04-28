import { useEffect, useRef, ReactNode } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 通用确认对话框，替代 window.confirm
 * 支持键盘操作（Escape 取消、Enter 仅在确认按钮聚焦时触发）和 ARIA 属性
 */
function ConfirmDialog({ open, title, message, confirmLabel = '确认', cancelLabel = '取消', danger, onConfirm, onCancel }: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // 打开时自动聚焦确认按钮，Escape 取消
  useEffect(() => {
    if (open) {
      confirmRef.current?.focus();
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onCancel();
        // Enter 仅在确认按钮聚焦时触发，避免用户在取消按钮上按 Enter 误确认
        if (e.key === 'Enter' && document.activeElement === confirmRef.current) onConfirm();
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <h3 id="confirm-title">{title}</h3>
        <p id="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button className="btn-secondary btn-sm" onClick={onCancel}>{cancelLabel}</button>
          <button ref={confirmRef} className={`btn-primary btn-sm ${danger ? 'btn-danger' : ''}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
