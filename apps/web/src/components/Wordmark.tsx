interface WordmarkProps {
  /** Spaced-uppercase line under the mark — 'BLOODS' everywhere except the odd design-system reference. */
  descriptor?: string;
  /** 'dark' for the deep hero/nav surfaces, 'light' for the cream/white ones. */
  variant?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: { mark: 'text-xl', dot: 'h-[3px] w-[3px] -translate-y-[130%]', descriptor: 'text-[8px]' },
  md: { mark: 'text-2xl', dot: 'h-1 w-1 -translate-y-[135%]', descriptor: 'text-[9px]' },
  lg: { mark: 'text-3xl md:text-4xl', dot: 'h-1.5 w-1.5 -translate-y-[140%]', descriptor: 'text-[10px]' },
};

/**
 * The brand mark: lowercase "aspire" with the tittle over the i rendered as
 * its own bronze dot (not the glyph's built-in one — the letter is set in
 * the dotless-ı codepoint so only our dot shows), plus a small tracked
 * descriptor underneath ("BLOODS"). Mirrors the Aspire Clinic site's
 * wordmark proportion (visual-polish brief).
 *
 * The dot is purely decorative (aria-hidden) and the visible letters sit
 * next to a screen-reader-only "aspire" so assistive tech never hears the
 * dotless-ı substitution.
 */
export function Wordmark({ descriptor = 'BLOODS', variant = 'dark', size = 'md', className = '' }: WordmarkProps) {
  const s = SIZES[size];
  const markColor = variant === 'dark' ? 'text-cream' : 'text-espresso';
  const dotColor = variant === 'dark' ? 'bg-bronze-300' : 'bg-bronze';
  const descriptorColor = variant === 'dark' ? 'text-taupe' : 'text-espresso/60';

  return (
    <span className={`inline-flex flex-col leading-none ${className}`}>
      <span aria-hidden="true" className={`font-display lowercase ${s.mark} ${markColor}`}>
        asp
        <span className="relative inline-block">
          ı
          <span className={`absolute left-1/2 top-0 -translate-x-1/2 rounded-full ${s.dot} ${dotColor}`} />
        </span>
        re
      </span>
      <span className="sr-only">aspire</span>
      {descriptor && (
        <span className={`mt-1 pl-0.5 font-eyebrow ${s.descriptor} uppercase tracking-[0.3em] ${descriptorColor}`}>
          {descriptor}
        </span>
      )}
    </span>
  );
}
