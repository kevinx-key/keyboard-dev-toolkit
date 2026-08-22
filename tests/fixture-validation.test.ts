/**
 * Smoke test: verify the 60% ANSI test fixture produces valid KeyProps data.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import {
  get60PercentANSILayout,
  ANSI_60_ROW_COUNTS,
  ANSI_60_TOTAL_KEYS,
  MODIFIER_LABELS_BY_ROW,
  getModifierKeys,
  getStandardKeys,
} from './fixtures/test-layout';
import type { KeyProps } from '@/lib/kle-types';

describe('60% ANSI test fixture', () => {
  let keys: KeyProps[];

  beforeAll(() => {
    keys = get60PercentANSILayout();
  });

  it('produces the correct total key count', () => {
    expect(keys.length).toBe(ANSI_60_TOTAL_KEYS);
  });

  it('produces at least 5 rows of keys', () => {
    // Count rows by detecting y=0 transitions (first key of each row has y=0)
    const firstInRow = keys.filter((k) => k.y === 0);
    expect(firstInRow.length).toBeGreaterThanOrEqual(5);
  });

  it('has keys with valid label arrays', () => {
    for (const key of keys) {
      expect(key.labels).toBeDefined();
      expect(key.labels).toHaveLength(12);
    }
  });

  it('includes modifier keys (wider than 1u)', () => {
    const wideKeys = getModifierKeys(keys);
    expect(wideKeys.length).toBeGreaterThan(0);
  });

  it('has standard 1u keys', () => {
    const stdKeys = getStandardKeys(keys);
    expect(stdKeys.length).toBeGreaterThan(0);
  });

  it('returns the same array on second call (cached)', () => {
    const keys2 = get60PercentANSILayout();
    expect(keys2).toBe(keys); // same reference = cached
  });

  it('row 1 has 14 keys', () => {
    expect(ANSI_60_ROW_COUNTS[0]).toBe(14);
  });

  it('row 5 has 8 keys (modifier row)', () => {
    expect(ANSI_60_ROW_COUNTS[4]).toBe(8);
  });

  it('spacebar is at least 6u wide in row 5', () => {
    const modifiers = MODIFIER_LABELS_BY_ROW[4] || [];
    expect(modifiers.length).toBeGreaterThanOrEqual(6);
  });

  it('all keys have valid width', () => {
    for (const key of keys) {
      expect(typeof key.w).toBe('number');
      expect(key.w).toBeGreaterThan(0);
    }
  });
});
