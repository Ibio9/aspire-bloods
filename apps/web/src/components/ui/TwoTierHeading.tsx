interface TwoTierHeadingProps {
  eyebrow: string;
  title: string;
  align?: 'left' | 'center';
}

/**
 * Mirrors the brand's two-tier headline pattern: a spaced-uppercase Inter
 * eyebrow paired with a Cormorant Garamond display line. Reserved for
 * high-weight moments (dashboard header, report header, marker hero) — not
 * every card, per brief.
 */
export function TwoTierHeading({ eyebrow, title, align = 'left' }: TwoTierHeadingProps) {
  return (
    <div className={align === 'center' ? 'text-center' : 'text-left'}>
      <p className="eyebrow mb-3">{eyebrow}</p>
      <h1 className="display-heading">{title}</h1>
    </div>
  );
}
