interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-16 w-16 text-lg',
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

/** Initials only — no stock photography, no generic dashboard chrome (brief §3.9). */
export function Avatar({ name, size = 'md' }: AvatarProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-bronze font-medium text-white ${SIZE_CLASSES[size]}`}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
