import { createContext } from 'preact';
import { useState, useEffect, useCallback, useContext, useRef } from 'preact/hooks';

const ToastContext = createContext(null);

function ToastItem({ id, message, type, onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => onClose(id), 4000);
    return () => clearTimeout(timer);
  }, [id, onClose]);

  const colorVar =
    type === 'success' ? 'var(--success)' :
    type === 'error' ? 'var(--error)' :
    'var(--accent)';

  return (
    <div class="toast-item" role="alert" style={{ borderLeftColor: colorVar }}>
      <span class="toast-message">{message}</span>
      <button
        class="toast-close"
        onClick={() => onClose(id)}
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counterRef = useRef(0);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message, type = 'info') => {
    const id = ++counterRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div class="toast-container" aria-live="polite">
        {toasts.map((t) => (
          <ToastItem key={t.id} {...t} onClose={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
