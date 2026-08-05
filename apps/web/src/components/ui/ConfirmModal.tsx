import { useState, type ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => Promise<void> | void;
  title: string;
  /** Exactly what is about to change — every destructive/clinically significant action shows this before it happens. */
  children: ReactNode;
  confirmLabel?: string;
  confirmingLabel?: string;
  variant?: 'destructive' | 'primary';
  /** When set, a required reason textarea is shown and passed to onConfirm. */
  requireReason?: boolean;
  reasonLabel?: string;
}

/**
 * Shared by every destructive/clinically-significant admin action (release,
 * edit-after-release, void, deactivate, erasure, ...) so "show exactly what
 * is about to change before it happens" is enforced consistently rather
 * than reimplemented per-action.
 */
export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  children,
  confirmLabel = 'Confirm',
  confirmingLabel = 'Working…',
  variant = 'destructive',
  requireReason = false,
  reasonLabel = 'Reason',
}: ConfirmModalProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (requireReason && !reason.trim()) {
      setError('A reason is required.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm(requireReason ? reason.trim() : undefined);
      setReason('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    if (submitting) return;
    setReason('');
    setError(null);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant={variant} loading={submitting} onClick={handleConfirm}>
            {submitting ? confirmingLabel : confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {requireReason && (
        <div className="mt-4 flex flex-col gap-1.5">
          <label htmlFor="confirm-reason" className="text-sm font-medium text-espresso">
            {reasonLabel}
          </label>
          <textarea
            id="confirm-reason"
            className="input-base min-h-20"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={submitting}
          />
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-status-significantHigh">
          {error}
        </p>
      )}
    </Modal>
  );
}
