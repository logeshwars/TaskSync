/**
 * Position helper unit tests.
 *
 * Locks in the "midPosition always produces a string that sorts strictly
 * between prev and next" invariant. If this ever breaks, the entire
 * drag-drop UI produces ordering chaos — so the test is small but load-bearing.
 */
import { firstPosition, midPosition } from './position';

describe('midPosition', () => {
  it('produces a deterministic first position for an empty list', () => {
    const a = firstPosition();
    const b = firstPosition();
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('returns a string strictly greater than prev when next is null', () => {
    const prev = firstPosition();
    const next = midPosition(prev, null);
    expect(next > prev).toBe(true);
  });

  it('returns a string strictly less than next when prev is null', () => {
    const next = midPosition(null, null);
    const afterNext = midPosition(next, null);
    const between = midPosition(null, next);
    expect(between < next).toBe(true);
    // And it should NOT have accidentally jumped past afterNext.
    expect(between < afterNext).toBe(true);
  });

  it('inserts between two adjacent positions without collision', () => {
    const a = firstPosition();
    const b = midPosition(a, null);
    const c = midPosition(a, b);
    expect(c > a && c < b).toBe(true);
  });

  it('survives 50 successive between-inserts without running out of precision', () => {
    let lo = firstPosition();
    let hi = midPosition(lo, null);
    for (let i = 0; i < 50; i += 1) {
      const mid = midPosition(lo, hi);
      expect(mid > lo && mid < hi).toBe(true);
      // Alternate which side we collapse to exercise both paths.
      if (i % 2 === 0) hi = mid;
      else lo = mid;
    }
  });
});
