import { describe, it, expect } from 'vitest';
import {
  applyHouseStyle,
  curlyApostrophes,
  curlyQuotes,
  plainCompoundDashes,
  removeEmDashes,
  sameWords,
} from '../src/lib/houseStyle.js';

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
    'Aspire Clinic — 29-35 Mortimer Street, London, W1T 3JG',
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

describe('curlyApostrophes', () => {
  it('curls a contraction and a singular possessive', () => {
    expect(curlyApostrophes("If it's high")).toBe('If it’s high');
    expect(curlyApostrophes("your blood's acid-base balance")).toBe('your blood’s acid-base balance');
  });

  it('leaves an already-curled apostrophe alone', () => {
    expect(curlyApostrophes('your body’s iron reserves')).toBe('your body’s iron reserves');
  });

  /**
   * The reason the rule is "between two letters" and nothing wider. A quote
   * mark is half of a pair, and a rule loose enough to catch a plural
   * possessive is also loose enough to curl the closing quote of a list item —
   * which is how a font stack once became `'IBM Plex Sans’, system-ui`.
   */
  it('never touches a quotation mark', () => {
    expect(curlyApostrophes("'IBM Plex Sans', system-ui")).toBe("'IBM Plex Sans', system-ui");
    expect(curlyApostrophes("Often called 'good' cholesterol")).toBe("Often called 'good' cholesterol");
  });
});

describe('curlyQuotes', () => {
  it('curls a balanced pair', () => {
    expect(curlyQuotes('Often called "good" cholesterol.')).toBe('Often called “good” cholesterol.');
  });

  it('opens and closes alternately across several pairs', () => {
    expect(curlyQuotes('"good" and "bad" cholesterol')).toBe('“good” and “bad” cholesterol');
  });

  /**
   * The whole reason `curlyApostrophes` refuses to touch quotation marks: half
   * a pair cannot be curled, because there is no way to know which half it is.
   * An odd count is left exactly as it is rather than guessed at.
   */
  it('leaves an odd number of marks completely alone', () => {
    expect(curlyQuotes('a 5" sample tube')).toBe('a 5" sample tube');
    expect(curlyQuotes('he said "we will see')).toBe('he said "we will see');
  });

  it('leaves copy with no quotation marks alone', () => {
    expect(curlyQuotes('Nothing to change here.')).toBe('Nothing to change here.');
  });

  it('leaves already-curled quotes alone', () => {
    expect(curlyQuotes('Often called “good” cholesterol.')).toBe('Often called “good” cholesterol.');
  });
});

describe('plainCompoundDashes', () => {
  it('hyphenates an en dash joining two words', () => {
    expect(plainCompoundDashes('the blood’s acid–base balance')).toBe('the blood’s acid-base balance');
  });

  /**
   * A numeric range keeps its en dash. Every reference range in the product is
   * set that way, on screen and in the PDF, and a rule that hyphenated
   * `3.9–5.1` would be rewriting the one piece of punctuation the design
   * system is most explicit about.
   */
  it('leaves a numeric range exactly as it is', () => {
    expect(plainCompoundDashes('3.9–5.1 mmol/L')).toBe('3.9–5.1 mmol/L');
    expect(plainCompoundDashes('Reference range 20–42')).toBe('Reference range 20–42');
  });

  it('leaves a range between abbreviations alone', () => {
    expect(plainCompoundDashes('especially Oct–Mar in the UK')).toBe('especially Oct–Mar in the UK');
    expect(plainCompoundDashes('Name (A–Z)')).toBe('Name (A–Z)');
  });
});

describe('applyHouseStyle', () => {
  const REAL_COPY = [
    'A protein that stores iron — reflects your body\'s iron reserves.',
    'An electrolyte that maintains the blood\'s acid–base balance.',
    'Levels vary through the day — highest in the morning — so timing matters.',
    'Reference range 3.9–5.1 mmol/L. Nothing to change here.',
    'Often called "good" cholesterol — helps remove excess cholesterol.',
    'A protein found on the particles that carry "bad" cholesterol.',
    'a 5" sample tube and one unmatched mark',
  ];

  it('changes punctuation and never a word', () => {
    for (const copy of REAL_COPY) {
      expect(words(applyHouseStyle(copy)), copy).toEqual(words(copy));
    }
  });

  it('is idempotent, so a re-seed is a no-op', () => {
    for (const copy of REAL_COPY) {
      const once = applyHouseStyle(copy);
      expect(applyHouseStyle(once), copy).toBe(once);
    }
  });

  it('applies all three corrections at once', () => {
    expect(applyHouseStyle("An electrolyte — it maintains the blood's acid–base balance.")).toBe(
      'An electrolyte. It maintains the blood’s acid-base balance.',
    );
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
