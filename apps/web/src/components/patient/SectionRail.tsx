import { useEffect, useRef, useState } from 'react';

/**
 * A VERTICAL INDEX OF THE PAGE'S OWN SECTIONS, beside the content and not in
 * the sidebar.
 *
 * The sidebar answers "where else can I go". This answers "what is on the page
 * I am on and how far down it am I", which is a different question and belongs
 * next to the thing it describes. The Overview is four sections deep and the
 * first of them can be a long list, so the other three were previously only
 * discoverable by scrolling past it.
 *
 * ── WHY THE LABELS ARE ROTATED, AND WHAT ELSE WAS TRIED ────────────────────
 *
 * Rotated, running along the line, bottom-to-top. The alternative was a bare
 * dot that reveals its label horizontally on hover, and the reason that lost is
 * that it is not an index — it is four unlabelled dots plus a promise. A person
 * who does not already know what the dots are has no reason to hover one, a
 * touch device has no hover at all, and the whole point of the rail is to say
 * what is further down the page WITHOUT being interrogated. A hover-revealed
 * label also has to be drawn over the content beside it, which is the one thing
 * a rail in a 48px gutter must never do.
 *
 * Rotated text is genuinely harder to read than horizontal text, and that cost
 * is paid deliberately and bounded: these are four fixed, short, familiar
 * phrases that the reader meets again as headings the moment they arrive. It is
 * an index, not prose. What makes it affordable is that nothing depends on it —
 * every section is a heading in the document with its own id, the rail is one
 * of two ways to reach it, and it is hidden entirely below `xl`.
 *
 * `writing-mode: vertical-rl` plus a 180° turn, rather than a bare
 * `rotate(-90deg)`: a rotated inline box keeps its horizontal line box, so it
 * has to be measured and positioned by hand and it does not participate in
 * layout. In a real vertical writing mode the browser lays the text out, so the
 * item's height IS the label's length and the rail spaces itself.
 *
 * ── EVERY DOT IS A REAL LINK ───────────────────────────────────────────────
 *
 * `href="#section-id"`, so with JavaScript off, or before hydration, or in a
 * reader-mode view, the rail still navigates. The click handler only upgrades
 * that to a smooth scroll and a focus move; it is not what makes it work.
 */

export interface RailSection {
  /** The `id` on the `<section>` element. Also the anchor target. */
  id: string;
  /** What the dot is labelled. Short: it is set vertically. */
  label: string;
}

/** Where down the viewport a section counts as "the one being read". */
const ACTIVE_LINE = 0.3;

export function SectionRail({ sections }: { sections: RailSection[] }) {
  const [active, setActive] = useState<string | null>(sections[0]?.id ?? null);
  // The list, so the effect can re-run when a section appears or disappears
  // (the attention section is absent for a patient with nothing out of range)
  // without depending on the array's identity, which changes every render.
  const key = sections.map((s) => s.id).join('|');
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const ids = key ? key.split('|') : [];
    if (ids.length === 0) return;

    /**
     * ONE ANSWER, ALWAYS. An IntersectionObserver over a thin band is the usual
     * way to do this and it has two states this does not: nothing in the band
     * (the gap between two sections is 96px on this page, which is most of a
     * band at some scroll positions) and more than one thing in it. Reading the
     * positions directly gives exactly one answer at every scroll offset —
     * the last section whose top has passed the line — which is what the filled
     * dot has to be.
     */
    function pick() {
      frame.current = null;
      const line = window.innerHeight * ACTIVE_LINE;
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= line) current = id;
      }
      // At the very bottom of the document the last section may never reach the
      // line — a short final section under a long one never can — and the rail
      // would then mark the second-to-last for ever while the reader looks at
      // the last. Being at the end of the page IS being in the last section.
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      setActive(atBottom ? ids[ids.length - 1] : current);
    }

    function onScroll() {
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(pick);
    }

    pick();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [key]);

  if (sections.length < 2) return null;

  function onClick(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
    const el = document.getElementById(id);
    if (!el) return; // Let the browser follow the href.
    e.preventDefault();

    // Read at click time rather than through a hook: the preference can change
    // under the page, and this is the only moment it is consulted.
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });

    // The URL still ends up at the anchor, so the position is shareable and the
    // back button behaves — `replaceState` rather than a push, because four
    // dots on one page should not fill somebody's history.
    history.replaceState(null, '', `#${id}`);

    // `preventScroll`, and it is the whole reason focus can move at all here: a
    // plain focus() jumps the viewport instantly and cancels the smooth scroll
    // that was the point of intercepting the click. The section carries
    // tabIndex={-1} so the next Tab continues from inside it rather than from
    // the top of the document.
    (el as HTMLElement).focus({ preventScroll: true });
  }

  return (
    <nav className="section-rail print-hide" aria-label="Sections on this page">
      <ol className="section-rail__list">
        {sections.map((section) => {
          const isActive = section.id === active;
          return (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                onClick={(e) => onClick(e, section.id)}
                aria-current={isActive ? 'true' : undefined}
                className={`section-rail__link ${isActive ? 'is-active' : ''}`}
              >
                <span className="section-rail__dot" aria-hidden="true" />
                <span className="section-rail__label">{section.label}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
