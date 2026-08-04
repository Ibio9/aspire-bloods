import { useId, useState, type ReactNode } from 'react';

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      <span aria-describedby={id}>{children}</span>
      {visible && (
        <span
          id={id}
          role="tooltip"
          className="motion-safe:animate-fadeIn pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-card bg-espresso px-2.5 py-1.5 text-xs text-white shadow-card"
        >
          {label}
        </span>
      )}
    </span>
  );
}
