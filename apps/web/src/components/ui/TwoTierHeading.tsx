interface TwoTierHeadingProps {
  eyebrow: string;
  title: string;
  align?: 'left' | 'center';
}

/**
 * The two-tier headline: a spaced-uppercase IBM Plex Sans eyebrow over a
 * Fraunces display line, set at the hero optical size. Reserved for
 * high-weight moments (dashboard header, report header, marker hero) — not
 * every card, per brief.
 */
export function TwoTierHeading({ eyebrow, title, align = 'left' }: TwoTierHeadingProps) {
  return (
    // The page header is the one place in the product with genuinely generous
    // space beneath it. It is the single biggest lever on whether this reads
    // as worth what patients paid, and it costs nothing but restraint.
    <div className={`pb-2 ${align === 'center' ? 'text-center' : 'text-left'}`}>
      <p className="eyebrow mb-4">{eyebrow}</p>
      {/* break-words: admin headings carry the patient's email when there's no name
          yet, and an unbroken address is wider than a 375px viewport. */}
      <h1 className="display-heading break-words">{title}</h1>
    </div>
  );
}
