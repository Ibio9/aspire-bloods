import { useEffect, useRef } from 'react';

/**
 * Everything a thing overlaying the page owes a keyboard: focus moves into it
 * when it opens, Tab cycles inside it rather than wandering off into the page
 * behind, Escape closes it, the background doesn't scroll under it, and focus
 * returns to whatever opened it on the way out.
 *
 * Extracted from Modal, which was the only overlay in the app doing all five.
 * The two navigation drawers and the command palette each did some subset —
 * the patient drawer moved focus in but let Tab escape, the admin drawer did
 * nothing at all — and a sighted keyboard user tabbing "past" an open drawer
 * lands on links they cannot see, which is the specific failure WCAG 2.4.3
 * and 2.1.2 describe.
 *
 * The element the ref is attached to needs tabIndex={-1} so it can hold focus
 * itself; that way a screen reader announces the dialog's own name before its
 * contents rather than starting mid-list.
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function useDialogFocus<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  // Read through a ref so a caller passing an inline arrow doesn't tear the
  // listener down and rebuild it on every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    ref.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !ref.current) return;

      // Hidden controls (a collapsed section, a display:none branch) are in the
      // DOM but not in the tab order — including them would send focus nowhere.
      const focusable = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

      if (focusable.length === 0) {
        e.preventDefault();
        ref.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        // Focus sitting on the container counts as "before the first" — without
        // this, the very first Shift+Tab escapes backwards into the page.
        if (active === first || active === ref.current) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      // The opener may itself have unmounted (signing out from inside the
      // drawer, say), in which case there is nothing to hand focus back to.
      if (previouslyFocused.current?.isConnected) previouslyFocused.current.focus();
    };
  }, [open]);

  return ref;
}
