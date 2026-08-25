import { useEffect } from 'react';
import { X } from 'lucide-react';

export interface Toast {
  id: number;
  tone: 'ok' | 'error' | 'info';
  message: string;
}

export function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }): JSX.Element {
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((t) => (
        <ToastRow key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastRow({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }): JSX.Element {
  useEffect(() => {
    // Errors stay until dismissed; a message you need to act on should not expire.
    if (toast.tone === 'error') return;
    const timer = window.setTimeout(() => onDismiss(toast.id), 9000);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  return (
    <div className="toast" data-tone={toast.tone} role={toast.tone === 'error' ? 'alert' : 'status'}>
      <span>{toast.message}</span>
      <button type="button" className="toast__close" onClick={() => onDismiss(toast.id)} aria-label="Dismiss">
        <X size={13} aria-hidden />
      </button>
    </div>
  );
}
