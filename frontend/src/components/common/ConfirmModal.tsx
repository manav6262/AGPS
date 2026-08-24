import React, { useEffect, useRef } from 'react';
import { AlertTriangle, AlertCircle, HelpCircle } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'primary';
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirm Action',
  cancelLabel = 'Cancel',
  variant = 'primary',
  isLoading = false,
  onConfirm,
  onCancel,
}) => {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    // Focus the confirm button on modal open
    setTimeout(() => {
      confirmButtonRef.current?.focus();
    }, 50);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const icon =
    variant === 'danger' ? (
      <AlertCircle className="w-5 h-5 text-status-failedText shrink-0" />
    ) : variant === 'warning' ? (
      <AlertTriangle className="w-5 h-5 text-brand shrink-0" />
    ) : (
      <HelpCircle className="w-5 h-5 text-brand shrink-0" />
    );

  const confirmBtnClass =
    variant === 'danger'
      ? 'btn-danger'
      : variant === 'warning'
      ? 'btn-primary bg-brand text-white hover:bg-brand-hover'
      : 'btn-primary';

  return (
    <div
      className="fixed inset-0 bg-stone-900/50 flex items-center justify-center p-4 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-desc"
    >
      <div className="bg-white border border-stone-300 rounded max-w-md w-full p-5 space-y-4 shadow-sm animate-none">
        <div className="flex items-start gap-3">
          {icon}
          <div>
            <h2 id="confirm-modal-title" className="text-sm font-bold text-stone-900">
              {title}
            </h2>
            <p id="confirm-modal-desc" className="text-xs text-stone-600 mt-1 leading-relaxed">
              {description}
            </p>
          </div>
        </div>

        <div className="pt-3 border-t border-stone-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="btn-secondary text-xs px-3 py-1.5"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`${confirmBtnClass} text-xs px-4 py-1.5 font-semibold`}
          >
            {isLoading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
