import { useEffect, useRef } from 'preact/hooks';

export default function Modal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  destructive = false,
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onCancel();

      // Basic focus trap
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Focus the dialog on open
    if (dialogRef.current) {
      const firstBtn = dialogRef.current.querySelector('button');
      if (firstBtn) firstBtn.focus();
    }

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div class="modal-overlay" onClick={onCancel} role="presentation">
      <div
        class="modal-card"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="modal-title" class="modal-title">{title}</h2>
        {message && <p class="modal-message">{message}</p>}
        <div class="modal-actions">
          <button class="modal-btn modal-btn-cancel" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            class={`modal-btn modal-btn-confirm${destructive ? ' modal-btn-destructive' : ''}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
