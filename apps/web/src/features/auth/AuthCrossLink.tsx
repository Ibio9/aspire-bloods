import { LinkButton } from '../../components/ui/LinkButton';

/**
 * The way between sign-in and registration.
 *
 * This used to be a sentence with a link buried in it under the sign-in
 * button, and the effect was that a new patient landing on the site saw a
 * login form and nothing else — /signup existed and nothing routed to it.
 * A cross-link between the only two doors into the product is not helper
 * text; it's the second door, and it's given the weight of one: its own
 * band, separated by a rule, with a real secondary-styled control in it.
 *
 * Still visibly secondary to the form's primary button — bronze fill for the
 * thing you came to do, bordered white for the other way round — so it can't
 * be mistaken for the main action on either screen.
 *
 * Keyboard: an anchor, so it's in the tab order for free and picks up the
 * global bronze :focus-visible ring (globals.css). Deliberately NOT a button
 * calling navigate(), so cmd-click and "open in new tab" work.
 */
/**
 * NOT `mt-auto` (Aug 2026). On the sign-in card this was a no-op — it is
 * followed by more content in a card whose height is its own content's. In the
 * REGISTRATION card it is the last thing in the narrow introduction column,
 * beside a form column three times as tall, so pushing it to the floor opened
 * about 200px of nothing between the introduction and it: an empty half-card
 * that reads as content which failed to load. It is the same failure this
 * codebase has already fixed twice with the same sentence — a column of unequal
 * things is allowed to be ragged along the bottom, and slack at the bottom of a
 * short column reads as nothing at all, where slack in the middle of one reads
 * as a hole. See ChangeCard and MarkerResultCard.
 */
export function AuthCrossLink({ prompt, to, label }: { prompt: string; to: string; label: string }) {
  return (
    <div className="mt-[calc(var(--auth-step)*1.6)] border-t border-taupe pt-[calc(var(--auth-step)*1.25)]">
      <p className="text-sm leading-relaxed text-espresso/90">{prompt}</p>
      <LinkButton to={to} variant="secondary" className="mt-[calc(var(--auth-step)*0.75)] w-full">
        {label}
      </LinkButton>
    </div>
  );
}
