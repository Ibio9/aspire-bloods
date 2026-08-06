import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { apiFetch } from '../lib/api';

/** The auth screens are viewport-fit (see AuthSplitLayout) — a global footer
 *  underneath a full-height shell is exactly what makes them scroll. It's also
 *  the wrong content there: the disclaimer is about how to read results, and
 *  the auth screens carry the clinic's own identity block on the left panel. */
const CHROMELESS_ROUTES = ['/login', '/signup', '/activate'];

export function Footer() {
  const { pathname } = useLocation();
  const [text, setText] = useState('');

  useEffect(() => {
    apiFetch<{ body: string }>('/content/footer-disclaimer')
      .then((r) => setText(r.body))
      .catch(() => {});
  }, []);

  if (!text || CHROMELESS_ROUTES.includes(pathname)) return null;

  return (
    <footer className="mt-16 border-t border-taupe px-6 py-8 md:px-16">
      <p className="max-w-3xl text-xs text-espresso">{text}</p>
    </footer>
  );
}
