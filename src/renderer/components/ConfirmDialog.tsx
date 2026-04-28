import { useEffect, useRef, useCallback, ReactNode } from 'react';

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
 * 支持键盘操作（Escape 取消、Enter 仅在确认按钮聚焦时触发）、焦点陷阱和 ARIA 属性
 */
function ConfirmDialog({ open, title, message, confirmLabel = '确认', cancelLabel = '取消', danger, onConfirm, onCancel }: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // 记录对话框打开前的焦点元素，关闭后恢复
  const previousFocusRef = useRef<HTMLElement | null>(null);
  // 用 ref 保存最新回调，避免 keydown handler 因 props 变化而重建
  const onCancelRef = useRef(onCancel);
  const onConfirmRef = useRef(onConfirm);
  onCancelRef.current = onCancel;
  onConfirmRef.current = onConfirm;

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') { onCancelRef.current(); return; }
    // Enter 仅在确认按钮聚焦时触发，避免用户在取消按钮上按 Enter 误确认
    if (e.key === 'Enter' && document.activeElement === confirmRef.current) { onConfirmRef.current(); return; }
    // 焦点陷阱：Tab / Shift+Tab 只在对话框内循环
    if (e.key === 'Tab' && dialogRef.current) {
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
  }, []);

  // 打开时保存当前焦点并聚焦确认按钮，关闭时恢复焦点
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement;
    confirmRef.current?.focus();
    return () => {
      // 对话框关闭后将焦点恢复到触发元素，符合 WAI-ARIA 对话框模式
      if (previousFocusRef.current && 'focus' in previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message" onClick={onCancel}>
      <div className="confirm-dialog" ref={dialogRef} onClick={(e) => e.stopPropagation()}>
        <h3 id="confirm-title">{title}</h3>
        <div id="confirm-message">{message}</div>
        <div className="confirm-actions">
          <button className="btn-secondary btn-sm" onClick={onCancel}>{cancelLabel}</button>
          <button ref={confirmRef} className={`btn-primary btn-sm ${danger ? 'btn-danger' : ''}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
