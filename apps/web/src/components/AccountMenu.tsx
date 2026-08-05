import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Avatar } from './ui/Avatar';
import { useAuth } from '../lib/AuthContext';

interface AccountMenuLink {
  to: string;
  label: string;
}

/**
 * The one place sign-out lives across the app (brief: "visible in the
 * header or account menu, not buried") — every top-level authenticated page
 * renders this in the same top-right position instead of each page growing
 * its own ad-hoc logout button.
 */
export function AccountMenu({ links = [] }: { links?: AccountMenuLink[] }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLAnchorElement | HTMLButtonElement | null)[]>([]);

  const items = [...links.map((l) => ({ kind: 'link' as const, ...l })), { kind: 'logout' as const, label: 'Sign out' }];

  useEffect(() => {
    if (!open) return;
    itemRefs.current[0]?.focus();

    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      const currentIndex = itemRefs.current.findIndex((el) => el === document.activeElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = itemRefs.current[(currentIndex + 1) % items.length];
        next?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = itemRefs.current[(currentIndex - 1 + items.length) % items.length];
        prev?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, items.length]);

  async function handleLogout() {
    setOpen(false);
    await logout();
    navigate('/login', { replace: true });
  }

  if (!user) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3 transition duration-150 ease-out hover:bg-cream-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze"
      >
        <Avatar name={user.displayName} size="sm" />
        <span className="hidden text-sm font-medium text-espresso sm:inline">{user.displayName}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true" className={`transition duration-150 ${open ? 'rotate-180' : ''}`}>
          <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" className="text-espresso/70" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account menu"
          className="absolute right-0 top-[calc(100%+8px)] z-40 w-56 origin-top-right rounded-card border border-taupe bg-cream-50 py-1.5 shadow-card motion-safe:animate-riseIn"
        >
          {links.map((link, i) => (
            <Link
              key={link.to}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              role="menuitem"
              to={link.to}
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-sm text-espresso outline-none transition duration-150 ease-out hover:bg-cream-200 focus-visible:bg-cream-200"
            >
              {link.label}
            </Link>
          ))}
          <div className="my-1.5 border-t border-taupe" role="separator" />
          <button
            ref={(el) => {
              itemRefs.current[links.length] = el;
            }}
            role="menuitem"
            type="button"
            onClick={() => void handleLogout()}
            className="block w-full px-4 py-2.5 text-left text-sm text-espresso outline-none transition duration-150 ease-out hover:bg-cream-200 focus-visible:bg-cream-200"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
