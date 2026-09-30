import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

export type ToastKind = 'success' | 'error' | 'info' | 'warning' | 'live';

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
}

interface ToastApi {
  push(toast: Omit<Toast, 'id'>): void;
  dismiss(id: number): void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToasts(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToasts must be used inside <ToastProvider>');
  return api;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((old) => old.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = nextId.current++;
      setToasts((old) => [...old.slice(-3), { ...toast, id }]);
      setTimeout(() => dismiss(id), toast.kind === 'error' ? 8_000 : 4_000);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ push, dismiss }), [push, dismiss]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" role="region" aria-label="Meldingen" aria-live="polite" data-testid="toasts">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.kind}`} data-testid="toast">
            <div className="toast-body">
              <strong>{toast.title}</strong>
              {toast.message && <span>{toast.message}</span>}
            </div>
            <button type="button" className="toast-close" onClick={() => dismiss(toast.id)} aria-label="Sluiten">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
