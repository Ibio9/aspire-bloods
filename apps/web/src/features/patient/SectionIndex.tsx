import type { ReportSection } from './reportSections';

/**
 * ---------------------------------------------------------------------------
 * A TABLE OF CONTENTS FOR ONE REPORT.
 * ---------------------------------------------------------------------------
 *
 * On a Signature report, 249 of 433 results sit BELOW the marker grid — the
 * genetic indicators, the 207 food sensitivities, the microbiome panel — and
 * nothing on the first screen said they were there. A reader who scrolled to
 * the end of the measured markers and stopped had seen a little over a third of
 * what they paid for, with no reason to suspect it: the page looked finished.
 *
 * ── IT IS DELIBERATELY SMALLER THAN THE STRIP ABOVE IT ─────────────────────
 *
 * The at-a-glance strip is the headline — how the panel went, in five numbers.
 * This is an index. It sits directly underneath and is quieter in every
 * dimension that carries weight: the small type step, no fill, a hairline at
 * most, and its separation from the strip is SPACE rather than a rule. An index
 * drawn at the strip's weight would be a second headline making a different
 * kind of claim, and the reader would have to decide which one to read first.
 *
 * ── ONE CHIP PER SECTION THAT EXISTS, AND NONE AT ALL BELOW TWO ────────────
 *
 * A chip for a section this report does not contain is a link that scrolls
 * nowhere. And a report with nothing but measured markers gets no index at all:
 * a one-item table of contents is furniture — it says "here is a list of the
 * one thing you can already see".
 *
 * ── EVERY CHIP IS A REAL LINK ──────────────────────────────────────────────
 *
 * `href="#section-id"`, so it navigates with JavaScript off, before hydration
 * and in a reader view. The handler only upgrades it: a smooth scroll (instant
 * under reduced motion), the hash written with `replaceState` so six chips do
 * not fill somebody's history, and `onReveal` for the sections that keep part
 * of themselves collapsed — a chip that lands you on a shut disclosure has
 * answered "is it there" with "yes, somewhere under this".
 */
export function SectionIndex({
  sections,
  onReveal,
}: {
  sections: ReportSection[];
  /** Called with the section's id, so a section holding collapsed groups can open them. */
  onReveal: (id: string) => void;
}) {
  if (sections.length < 2) return null;

  function go(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
    const el = document.getElementById(id);
    if (!el) return; // Let the browser follow the href.
    e.preventDefault();
    onReveal(id);
    // Read at click time rather than through a hook: the preference can change
    // under the page, and this is the only moment it is consulted.
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(null, '', `#${id}`);
    // preventScroll, and it is the whole reason focus can move here at all: a
    // plain focus() jumps the viewport instantly and cancels the smooth scroll
    // that was the point of intercepting the click.
    el.focus({ preventScroll: true });
  }

  return (
    <nav aria-label="Sections in this report" className="mt-8 print-hide">
      <ul className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              onClick={(e) => go(e, section.id)}
              className="inline-flex items-center gap-1.5 rounded-full border border-taupe/70 px-3 py-1.5 text-xs text-espresso/85 transition duration-150 ease-out hover:border-bronze hover:text-bronze focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bronze"
            >
              <span>{section.label}</span>
              {/* The count is data, so it is mono like every other number in
                  the product — and it is the half of the chip that says the
                  section is worth the trip. */}
              <span className="numeric text-espresso/80">{section.count}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
