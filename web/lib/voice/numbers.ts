/**
 * English number words → numeric values, for voice-logged sets.
 *
 * Speech recognition usually returns digits ("60") but often spells smaller
 * or compound numbers out ("sixty", "twelve point five", "a hundred"), so the
 * parser normalizes word runs to digits before applying its grammar.
 */

const ONES: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const NUMBER_WORDS = new Set([
  ...Object.keys(ONES),
  ...Object.keys(TENS),
  "hundred",
  "thousand",
  "point",
  "half",
]);

/** Parse a run of number-ish tokens. Returns null when the run is not a number
 * ("a" alone, "point" alone, "twenty hundred", …) so callers keep the original text. */
export function wordsToNumber(rawTokens: string[]): number | null {
  let tokens = rawTokens.map((t) => t.toLowerCase());
  if (tokens.length === 0) return null;

  // Trailing "… and a half" / "… a half" / "… half" adds 0.5 ("sixty two and a half").
  let half = false;
  if (tokens[tokens.length - 1] === "half") {
    half = true;
    tokens = tokens.slice(0, -1);
    if (tokens[tokens.length - 1] === "a" || tokens[tokens.length - 1] === "an") {
      tokens = tokens.slice(0, -1);
    }
    if (tokens[tokens.length - 1] === "and") {
      tokens = tokens.slice(0, -1);
    }
  }
  // Trailing connectors carry no value ("one hundred and").
  while (tokens[tokens.length - 1] === "and") {
    tokens = tokens.slice(0, -1);
  }

  const pointIndex = tokens.indexOf("point");
  if (tokens.indexOf("point", pointIndex + 1) !== -1) return null; // two "point"s
  const intTokens = pointIndex === -1 ? tokens : tokens.slice(0, pointIndex);
  const decTokens = pointIndex === -1 ? [] : tokens.slice(pointIndex + 1);

  let decimal = 0;
  if (decTokens.length > 0) {
    const digits: number[] = [];
    for (const token of decTokens) {
      const value = ONES[token];
      if (value === undefined || value > 9) return null; // "point twenty" is not a number
      digits.push(value);
    }
    decimal = Number(`0.${digits.join("")}`);
  }

  let total = 0;
  let current = 0;
  let seen = false;
  for (let i = 0; i < intTokens.length; i++) {
    const token = intTokens[i];
    const one = ONES[token];
    if (one !== undefined) {
      // Colloquial hundreds: "one forty" means 140, not 41.
      const next = intTokens[i + 1];
      const nextTen = next !== undefined ? TENS[next] : undefined;
      if (one >= 1 && one <= 9 && nextTen !== undefined) {
        current += one * 100 + nextTen;
        i++;
      } else {
        current += one;
      }
      seen = true;
      continue;
    }
    const ten = TENS[token];
    if (ten !== undefined) {
      current += ten;
      seen = true;
      continue;
    }
    if (token === "a" || token === "an") {
      // Only meaningful as "a hundred" / "a thousand".
      const next = intTokens[i + 1];
      if (next !== "hundred" && next !== "thousand") return null;
      current += 1;
      seen = true;
      continue;
    }
    if (token === "hundred") {
      if (!seen || current === 0) return null;
      current *= 100;
      continue;
    }
    if (token === "thousand") {
      if (!seen || current === 0) return null;
      total += current * 1000;
      current = 0;
      continue;
    }
    if (token === "and") continue; // "one hundred and five"
    return null;
  }

  if (!seen && !half) return null;
  return total + current + (half ? 0.5 : 0) + decimal;
}

function isRunStart(token: string, next: string | undefined): boolean {
  if (NUMBER_WORDS.has(token)) return true;
  // "a hundred" / "an thousand" — a lone "a" never starts a number run.
  return (token === "a" || token === "an") && (next === "hundred" || next === "thousand");
}

function isRunContinuation(token: string): boolean {
  return NUMBER_WORDS.has(token) || token === "and" || token === "a" || token === "an";
}

/**
 * Replace spoken number-word runs in already-lowercased text with digits:
 * "bench sixty two point five kilos" → "bench 62.5 kilos". Runs that fail to
 * parse are left untouched so the grammar stage sees the original words.
 */
export function spokenToDigits(text: string): string {
  const tokens = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (!isRunStart(tokens[i], tokens[i + 1])) {
      out.push(tokens[i]);
      i++;
      continue;
    }
    let j = i;
    while (j < tokens.length && isRunContinuation(tokens[j])) j++;
    const value = wordsToNumber(tokens.slice(i, j));
    if (value === null) {
      out.push(tokens[i]);
      i++;
    } else {
      out.push(String(value));
      i = j;
    }
  }
  return out.join(" ");
}
