/**
 * Sortable position strings (LexoRank-lite).
 *
 * Why strings instead of floats?
 *   - Floats run out of precision after ~50 inserts between two siblings,
 *     forcing periodic global "rebalance" passes.
 *   - Strings can be sub-divided indefinitely: between "n" and "o" you can
 *     always insert "nh", and between "n" and "nh" you can insert "nf",
 *     and so on.
 *
 * The implementation here is intentionally minimal. It's NOT a full
 * LexoRank — we don't bucket, we don't gracefully handle ASCII overflow
 * past `~`. For the scale we operate at (hundreds of items per list) it
 * is more than enough. The internal callers always go through the helpers
 * below so we can swap in a battle-tested package later without touching
 * call sites.
 */

const MIN_CHAR = '0'.charCodeAt(0); // 48
const MAX_CHAR = 'z'.charCodeAt(0); // 122

/** Sentinel "before everything" anchor. */
const HEAD = String.fromCharCode(MIN_CHAR);
/** Sentinel "after everything" anchor. */
const TAIL = String.fromCharCode(MAX_CHAR);

/**
 * Generate a position that sorts strictly between `prev` and `next`.
 * Either side can be `null` to mean "no neighbour" (start or end of list).
 *
 * Algorithm:
 *   - Walk both strings character by character.
 *   - As soon as `prev[i] + 1 < next[i]`, insert the midpoint character
 *     and stop.
 *   - If they share a prefix and only differ at later positions, append
 *     the average of (prev's next char, MAX) — guarantees we sort after
 *     the prev branch but before next.
 */
export function midPosition(prev: string | null, next: string | null): string {
  const a = prev ?? HEAD;
  const b = next ?? TAIL.repeat(Math.max(a.length + 1, 1));

  let i = 0;
  let result = '';
  while (true) {
    const ac = i < a.length ? a.charCodeAt(i) : MIN_CHAR;
    const bc = i < b.length ? b.charCodeAt(i) : MAX_CHAR + 1;

    if (bc - ac > 1) {
      // Room to insert at this position.
      result += String.fromCharCode(Math.floor((ac + bc) / 2));
      return result;
    }

    // Otherwise copy the lower bound and descend further.
    result += String.fromCharCode(ac);
    i += 1;

    // Safety net: bail out if we've descended absurdly deep.
    if (i > 64) {
      throw new Error('Position string ran too deep — rebalance required.');
    }
  }
}

/** First position when the list is empty. */
export function firstPosition(): string {
  return midPosition(null, null);
}
