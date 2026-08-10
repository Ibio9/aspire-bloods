import { describe, it, expect } from 'vitest';
import { removeEmDashes, sameWords } from '../src/lib/houseStyle.js';

/**
 * The house-style sweep runs over copy a clinician wrote, so the property that
 * matters is not "it looks right" but "it changed nothing but punctuation".
 * That is asserted directly: strip the punctuation from both sides and the two
 * strings must be identical, word for word, on every input.
 */
function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

describe('removeEmDashes', () => {
  const REAL_COPY = [
    'Often called "good" cholesterol — helps remove excess cholesterol from your bloodstream.',
    'A protein that stores iron — reflects your body’s iron reserves.',
    'This is not a diagnosis — many things can affect a single result.',
    'Aspire Clinic — Aspire Group of Companies, 27 Mortimer Street, London',
    'Levels vary through the day — highest in the morning — so timing matters.',
    'Nothing to change here.',
  ];

  it('leaves the words exactly as they were', () => {
    for (const copy of REAL_COPY) {
      expect(words(removeEmDashes(copy)), copy).toEqual(words(copy));
    }
  });

  it('removes every em dash', () => {
    for (const copy of REAL_COPY) {
      expect(removeEmDashes(copy).includes('—'), copy).toBe(false);
    }
  });

  it('starts a new sentence where the clause can take a capital', () => {
    expect(removeEmDashes('Often called "good" cholesterol — helps remove excess cholesterol.')).toBe(
      'Often called "good" cholesterol. Helps remove excess cholesterol.',
    );
  });

  it('uses a comma where the next word is already a proper noun', () => {
    expect(removeEmDashes('Aspire Clinic — Manchester')).toBe('Aspire Clinic, Manchester');
  });

  it('handles more than one dash in a sentence', () => {
    expect(removeEmDashes('Levels vary through the day — highest in the morning — so timing matters.')).toBe(
      'Levels vary through the day. Highest in the morning. So timing matters.',
    );
  });

  it('leaves copy with no em dash untouched', () => {
    const clean = 'A protein that stores iron. It reflects your iron reserves.';
    expect(removeEmDashes(clean)).toBe(clean);
  });

  it('leaves an unspaced dash alone, which could be part of a compound', () => {
    expect(removeEmDashes('low—risk')).toBe('low—risk');
  });
});

/**
 * The gate that decides whether the seed may replace a stored string with its
 * own current wording. It has to say yes to "our copy, older punctuation" and
 * no to anything a person has actually reworded, because the second one is a
 * seed script overwriting somebody's work.
 */
describe('sameWords', () => {
  it('matches the same sentence in a different punctuation style', () => {
    expect(
      sameWords(
        'This is not a diagnosis — many things can affect a single result.',
        'This is not a diagnosis. Many things can affect a single result.',
      ),
    ).toBe(true);
  });

  it('refuses a rewording, however small', () => {
    expect(
      sameWords(
        'Often called "good" cholesterol. Helps remove excess cholesterol.',
        'Often called "good" cholesterol. It helps remove excess cholesterol.',
      ),
    ).toBe(false);
  });

  it('refuses copy about a different thing entirely', () => {
    expect(sameWords('A protein that stores iron.', 'A protein your liver makes.')).toBe(false);
  });

  it('treats absent and empty as the same nothing', () => {
    expect(sameWords(null, '')).toBe(true);
    expect(sameWords(undefined, null)).toBe(true);
    expect(sameWords(null, 'something')).toBe(false);
  });
});
