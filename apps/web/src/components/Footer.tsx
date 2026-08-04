import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';

export function Footer() {
  const [text, setText] = useState('');

  useEffect(() => {
    apiFetch<{ body: string }>('/content/footer-disclaimer')
      .then((r) => setText(r.body))
      .catch(() => {});
  }, []);

  if (!text) return null;

  return (
    <footer className="mt-16 border-t border-taupe px-6 py-8 md:px-16">
      <p className="max-w-3xl text-xs text-espresso">{text}</p>
    </footer>
  );
}
