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
export function AuthCrossLink({ prompt, to, label }: { prompt: string; to: string; label: string }) {
  return (
    <div className="mt-auto border-t border-taupe pt-[calc(var(--auth-step)*1.25)]">
      <p className="text-sm leading-relaxed text-espresso/90">{prompt}</p>
      <LinkButton to={to} variant="secondary" className="mt-[calc(var(--auth-step)*0.75)] w-full">
        {label}
      </LinkButton>
    </div>
  );
}
