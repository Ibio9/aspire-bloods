import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type ToastVariant = 'default' | 'success' | 'error';

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  durationMs: number;
}

interface ToastContextValue {
  show: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_STYLES: Record<ToastVariant, string> = {
  default: 'border-taupe text-espresso',
  success: 'border-status-inRange text-espresso',
  error: 'border-status-significantHigh text-espresso',
};

const MIN_DURATION_MS = 3200;
const MS_PER_CHAR = 60;
const MAX_DURATION_MS = 9000;

/** Longer messages get more time to read — clamped so a one-word toast doesn't vanish before it
 * registers and a paragraph-length one doesn't camp on screen forever. */
function durationFor(message: string): number {
  return Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, message.length * MS_PER_CHAR));
}

function ToastIcon({ variant }: { variant: ToastVariant }) {
  if (variant === 'success') {
    return (
      <svg className="h-4 w-4 shrink-0 text-status-inRange" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M2 8.5L6 12.5L14 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (variant === 'error') {
    return (
      <svg className="h-4 w-4 shrink-0 text-status-significantHigh" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 4.5V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="8" cy="11.5" r="1" fill="currentColor" />
      </svg>
    );
  }
  return null;
}

function ToastRow({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const remainingRef = useRef(toast.durationMs);
  const startRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const arm = useCallback(() => {
    startRef.current = Date.now();
    timerRef.current = setTimeout(() => onDismiss(toast.id), remainingRef.current);
  }, [onDismiss, toast.id]);

  useEffect(() => {
    arm();
    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pause() {
    clearTimeout(timerRef.current);
    remainingRef.current -= Date.now() - startRef.current;
  }

  return (
    <div
      role={toast.variant === 'error' ? 'alert' : 'status'}
      onMouseEnter={pause}
      onMouseLeave={arm}
      onFocus={pause}
      onBlur={arm}
      className={`pointer-events-auto flex w-80 items-start gap-2.5 rounded-card border bg-white px-4 py-3 text-sm shadow-popover motion-safe:animate-riseIn ${VARIANT_STYLES[toast.variant]}`}
    >
      <ToastIcon variant={toast.variant} />
      <p className="flex-1">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="-m-1 shrink-0 rounded-full p-1 text-espresso/50 transition duration-150 ease-out hover:bg-cream-200 hover:text-espresso active:scale-90 active:duration-0"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((t) => t.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback((message: string, variant: ToastVariant = 'default') => {
    const id = crypto.randomUUID();
    setToasts((t) => [...t, { id, message, variant, durationMs: durationFor(message) }]);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2" aria-live="polite">
          {toasts.map((t) => (
            <ToastRow key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
