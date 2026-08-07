import { cloneElement, isValidElement, useEffect, useId, useState, type ReactElement } from 'react';

interface TooltipProps {
  label: string;
  children: ReactElement;
}

export function Tooltip({ label, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  useEffect(() => {
    if (!visible) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setVisible(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [visible]);

  // aria-describedby belongs on the focusable trigger itself, not a wrapping span, or screen readers
  // never pick it up — clone it onto whatever element was passed in rather than assuming a shape.
  const existingDescribedBy = isValidElement(children) ? (children.props as { 'aria-describedby'?: string })['aria-describedby'] : undefined;
  const trigger = isValidElement(children)
    ? cloneElement(children, {
        'aria-describedby': [existingDescribedBy, id].filter(Boolean).join(' '),
      } as Record<string, unknown>)
    : children;

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {trigger}
      {visible && (
        <span
          id={id}
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-card bg-night px-2.5 py-1.5 text-xs text-oncolor shadow-card motion-safe:animate-fadeIn"
        >
          {label}
        </span>
      )}
    </span>
  );
}
