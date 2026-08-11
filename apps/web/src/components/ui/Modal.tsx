import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDialogFocus } from '../../lib/useDialogFocus';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  // Focus trap, Escape, background scroll lock and focus restore all live in
  // the hook now — it was lifted out of this file so the two nav drawers and
  // the command palette stop each reimplementing a different subset of it.
  const dialogRef = useDialogFocus<HTMLDivElement>(open, onClose);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-night/60 motion-safe:animate-fadeIn"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="relative flex max-h-[85vh] w-full max-w-md flex-col rounded-card border border-taupe bg-cream-50 p-7 shadow-popover sm:p-9 outline-none motion-safe:animate-riseIn"
      >
        <h2 id="modal-title" className="font-display opsz-section text-xl text-espresso">
          {title}
        </h2>
        <div className="scroll-thin mt-4 overflow-y-auto text-sm text-espresso">{children}</div>
        {footer && <div className="mt-6 flex justify-end gap-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
