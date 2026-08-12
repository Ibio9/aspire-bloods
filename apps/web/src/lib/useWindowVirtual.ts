import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/**
 * ===========================================================================
 *  VIRTUALISATION AGAINST THE PAGE'S OWN SCROLL, NOT AGAINST A BOX.
 * ===========================================================================
 *
 * The Signature report is 23,862 pixels tall and the food sensitivity list is
 * most of it. The ordinary fix is a fixed-height scroll box with rows recycled
 * inside it, and this deliberately is not that: a scrolling region inside a
 * scrolling page is two scrollbars competing for the same wheel gesture, it
 * traps a trackpad, and on a phone it is close to unusable. The rest of this
 * product refuses internal scroll for exactly that reason (see the auth cards).
 *
 * So the list keeps its natural place in the document and its full natural
 * HEIGHT — two spacers stand in for the rows that are not rendered — and only
 * the rows near the viewport actually exist as DOM. Scroll position, the
 * browser's own scrollbar, anchor links and the print stylesheet all go on
 * seeing one continuous page.
 *
 * WHAT IT COSTS, STATED PLAINLY. A row that is not rendered is not findable
 * with the browser's own Ctrl+F, and is not in the accessibility tree. That is
 * a real loss and it is why this is applied only above a threshold, and only to
 * a list that already carries its own search field over the name a patient
 * actually reads. A short list renders whole and behaves exactly as it did.
 */

export interface VirtualWindow {
  /** Index of the first item to render. */
  start: number;
  /** Index one past the last item to render. */
  end: number;
  /** Height of the spacer standing in for the rows above `start`. */
  padTop: number;
  /** Height of the spacer standing in for the rows below `end`. */
  padBottom: number;
  /** Attach to any rendered row; the first one to report a height sets the row pitch. */
  measureRow: (element: HTMLElement | null) => void;
}

export function useWindowVirtual({
  itemCount,
  columns,
  estimatedRowHeight,
  containerRef,
  enabled,
  overscanRows = 4,
}: {
  itemCount: number;
  /** How many items share a row. Read from the same breakpoints the grid uses. */
  columns: number;
  estimatedRowHeight: number;
  containerRef: RefObject<HTMLElement>;
  /** False renders everything — a short list, or a list that is not open. */
  enabled: boolean;
  overscanRows?: number;
}): VirtualWindow {
  // MEASURED, NOT ASSUMED. A hardcoded pitch is right until somebody changes a
  // padding token, at which point the spacers and the rows disagree and the
  // list drifts as you scroll. The estimate is only ever used for the very
  // first paint, and one row is enough to correct it because every row in this
  // list is one line by construction.
  const [rowHeight, setRowHeight] = useState(estimatedRowHeight);
  const measured = useRef(false);
  const measureRow = useCallback((element: HTMLElement | null) => {
    if (!element || measured.current) return;
    const height = element.getBoundingClientRect().height;
    if (height > 0) {
      measured.current = true;
      setRowHeight((current) => (Math.abs(current - height) > 0.5 ? height : current));
    }
  }, []);

  const rows = Math.max(1, Math.ceil(itemCount / Math.max(1, columns)));
  const [range, setRange] = useState({ first: 0, last: rows });

  useEffect(() => {
    if (!enabled) {
      setRange({ first: 0, last: rows });
      return;
    }
    let frame = 0;
    function update() {
      frame = 0;
      const element = containerRef.current;
      if (!element) return;
      // Relative to the container's own top, which is what the row indices are
      // measured from. getBoundingClientRect is a read against the last layout,
      // so this never forces one on the scroll path.
      const rect = element.getBoundingClientRect();
      const overscan = overscanRows * rowHeight;
      const top = Math.max(0, -rect.top - overscan);
      const bottom = -rect.top + window.innerHeight + overscan;
      const first = Math.max(0, Math.min(rows - 1, Math.floor(top / rowHeight)));
      const last = Math.max(first + 1, Math.min(rows, Math.ceil(bottom / rowHeight)));
      setRange((previous) => (previous.first === first && previous.last === last ? previous : { first, last }));
    }
    function onScroll() {
      // One update per frame at most. A scroll handler that runs per event is
      // the thing that makes a virtualised list feel worse than the list it
      // replaced.
      if (!frame) frame = requestAnimationFrame(update);
    }
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [enabled, rows, rowHeight, overscanRows, containerRef]);

  if (!enabled) {
    return { start: 0, end: itemCount, padTop: 0, padBottom: 0, measureRow };
  }

  const first = Math.min(range.first, Math.max(0, rows - 1));
  const last = Math.min(Math.max(range.last, first + 1), rows);
  return {
    start: first * columns,
    end: Math.min(itemCount, last * columns),
    padTop: first * rowHeight,
    padBottom: Math.max(0, (rows - last) * rowHeight),
    measureRow,
  };
}

/**
 * How many items are on a row, from the SAME breakpoints the grid class uses.
 *
 * `sm:grid-cols-2 lg:grid-cols-3` are viewport media queries, so the viewport
 * width is not an approximation of the answer here — it is the answer. A
 * ResizeObserver on the container would be measuring the wrong box.
 */
export function useGridColumns(breakpoints: { minWidth: number; columns: number }[]): number {
  const resolve = useCallback(() => {
    if (typeof window === 'undefined') return breakpoints[breakpoints.length - 1]?.columns ?? 1;
    const width = window.innerWidth;
    return breakpoints.find((b) => width >= b.minWidth)?.columns ?? 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [columns, setColumns] = useState(resolve);
  useEffect(() => {
    function onResize() {
      setColumns(resolve());
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [resolve]);
  return columns;
}
