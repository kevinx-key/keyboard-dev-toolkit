import { describe, it, expect } from 'vitest';
import { stringify, parse } from '@/lib/kle-urlon';

// ── Helpers ──

/** Round-trip a value through stringify → parse */
function roundTrip(v: unknown): unknown {
  return parse(stringify(v));
}

// ── Tests ──

describe('URLON Codec', () => {
  // ─── Primitives ───

  describe('numbers', () => {
    it('positive integer', () => {
      expect(stringify(42)).toBe(':42');
      expect(parse(':42')).toBe(42);
      expect(roundTrip(42)).toBe(42);
    });

    it('negative integer', () => {
      expect(stringify(-7)).toBe(':-7');
      expect(parse(':-7')).toBe(-7);
      expect(roundTrip(-7)).toBe(-7);
    });

    it('zero', () => {
      expect(stringify(0)).toBe(':0');
      expect(parse(':0')).toBe(0);
      expect(roundTrip(0)).toBe(0);
    });

    it('float', () => {
      const s = stringify(3.14);
      expect(s.startsWith(':')).toBe(true);
      expect(parse(s)).toBe(3.14);
      expect(roundTrip(3.14)).toBe(3.14);
    });

    it('negative float', () => {
      expect(roundTrip(-0.5)).toBe(-0.5);
    });

    it('large number', () => {
      expect(roundTrip(99999)).toBe(99999);
    });

    it('NaN serializes to :null', () => {
      expect(stringify(NaN)).toBe(':null');
    });
  });

  describe('booleans', () => {
    it('true', () => {
      expect(stringify(true)).toBe(':true');
      expect(parse(':true')).toBe(true);
      expect(roundTrip(true)).toBe(true);
    });

    it('false', () => {
      expect(stringify(false)).toBe(':false');
      expect(parse(':false')).toBe(false);
      expect(roundTrip(false)).toBe(false);
    });
  });

  describe('null', () => {
    it('null round-trip', () => {
      expect(stringify(null)).toBe(':null');
      expect(parse(':null')).toBeNull();
      expect(roundTrip(null)).toBeNull();
    });
  });

  describe('strings', () => {
    it('simple string', () => {
      const s = stringify('hello');
      expect(s.startsWith('=')).toBe(true);
      expect(parse(s)).toBe('hello');
      expect(roundTrip('hello')).toBe('hello');
    });

    it('empty string', () => {
      const s = stringify('');
      expect(s.startsWith('=')).toBe(true);
      expect(parse(s)).toBe('');
      expect(roundTrip('')).toBe('');
    });

    it('string with spaces', () => {
      expect(roundTrip('hello world')).toBe('hello world');
    });

    it('string with newlines preserves through round-trip', () => {
      // Note: decodeURI does NOT convert \n to newline — it converts %0A
      // URLON encoding will encodeURI the newline as %0A, then
      // decodeURI converts %0A back to \n. So round-trip preserves \n.
      const original = 'line1\nline2';
      const r = roundTrip(original);
      expect(r).toBe(original);
    });

    it('string with URLON special characters (=:&@_;/)', () => {
      const special = 'a=b:c&d@e_f;g/h';
      expect(roundTrip(special)).toBe(special);
    });

    it('string with only special characters', () => {
      const special = '=:&@_;/';
      expect(roundTrip(special)).toBe(special);
    });

    it('Chinese / CJK characters', () => {
      expect(roundTrip('你好世界')).toBe('你好世界');
    });

    it('Japanese characters', () => {
      expect(roundTrip('キーボード')).toBe('キーボード');
    });

    it('emoji', () => {
      expect(roundTrip('🎹⌨️🎵')).toBe('🎹⌨️🎵');
    });

    it('mixed Unicode', () => {
      const mixed = 'Esc\tEnter™®';
      expect(roundTrip(mixed)).toBe(mixed);
    });

    it('percent-encoded sequences are preserved in round-trip', () => {
      // %20 in the original string gets double-encoded (% → %25) by
      // encodeURI, then decoded back (%25 → %) by decodeURI.
      expect(roundTrip('a%20b')).toBe('a%20b');
    });

    it('actual URL-encoded string (%20) is decoded by decodeURI', () => {
      // When a URLON string already contains percent-encoding (as produced
      // by encodeURI), the parser decodes it via decodeURI.
      const encoded = stringify('a b'); // space becomes %20 via encodeURI
      const decoded = parse(encoded);
      expect(decoded).toBe('a b');
    });
  });

  // ─── Arrays ───

  describe('arrays', () => {
    it('empty array', () => {
      // Trailing ; is stripped by stringify()
      expect(stringify([])).toBe('@');
      expect(parse('@')).toEqual([]);
      expect(roundTrip([])).toEqual([]);
    });

    it('array of strings', () => {
      expect(roundTrip(['A', 'B', 'C'])).toEqual(['A', 'B', 'C']);
    });

    it('array of numbers', () => {
      expect(roundTrip([1, 2, 3])).toEqual([1, 2, 3]);
    });

    it('array of mixed types', () => {
      expect(roundTrip(['hello', 42, true, null])).toEqual(['hello', 42, true, null]);
    });

    it('nested arrays', () => {
      expect(roundTrip([['a', 'b'], ['c', 'd']])).toEqual([['a', 'b'], ['c', 'd']]);
    });

    it('deeply nested arrays', () => {
      expect(roundTrip([[[[1]]]])).toEqual([[[[1]]]]);
    });

    it('single-element array', () => {
      expect(roundTrip(['x'])).toEqual(['x']);
    });

    it('array with object elements', () => {
      expect(roundTrip(['A', { x: 1 }, 'B'])).toEqual(['A', { x: 1 }, 'B']);
    });
  });

  // ─── Objects ───

  describe('objects', () => {
    it('empty object', () => {
      // Trailing ; is stripped
      expect(stringify({})).toBe('_');
      expect(parse('_')).toEqual({});
      expect(roundTrip({})).toEqual({});
    });

    it('string values', () => {
      expect(roundTrip({ key: 'value' })).toEqual({ key: 'value' });
    });

    it('number values', () => {
      expect(roundTrip({ x: 1, y: 2 })).toEqual({ x: 1, y: 2 });
    });

    it('boolean values', () => {
      expect(roundTrip({ active: true, hidden: false })).toEqual({ active: true, hidden: false });
    });

    it('null values', () => {
      expect(roundTrip({ nothing: null })).toEqual({ nothing: null });
    });

    it('mixed value types', () => {
      expect(roundTrip({ name: 'test', count: 5, ok: true })).toEqual({ name: 'test', count: 5, ok: true });
    });

    it('multiple keys (order preserved)', () => {
      const obj = { c: 3, a: 1, b: 2 };
      expect(roundTrip(obj)).toEqual(obj);
    });

    it('nested objects', () => {
      expect(roundTrip({ outer: { inner: 'value' } })).toEqual({ outer: { inner: 'value' } });
    });

    it('object with array values', () => {
      expect(roundTrip({ items: [1, 2, 3] })).toEqual({ items: [1, 2, 3] });
    });

    it('undefined values are omitted', () => {
      const s = stringify({ a: 1, b: undefined });
      const parsed = parse(s) as Record<string, unknown>;
      expect(parsed.a).toBe(1);
      expect(parsed.b).toBeUndefined();
    });
  });

  // ─── KLE-Specific Structures ───

  describe('KLE data structures', () => {
    it('array of rows with strings and property objects', () => {
      const layout = [
        [{ x: 1 }, 'F1', 'F2'],
        [{ y: 0.5 }, '~\n`', { w: 2 }, 'Backspace'],
      ];
      expect(roundTrip(layout)).toEqual(layout);
    });

    it('KLE property object with various types', () => {
      const props = { x: 2.5, y: 1, w: 1.25, h: 2, r: 30 };
      expect(roundTrip(props)).toEqual(props);
    });

    it('KLE property object with boolean flags', () => {
      const props = { d: true, g: false, l: true, n: false };
      expect(roundTrip(props)).toEqual(props);
    });

    it('KLE property object with string values', () => {
      const props = { c: '#ff0000', t: '#ffffff', p: 'DSA' };
      expect(roundTrip(props)).toEqual(props);
    });

    it('KLE metadata object', () => {
      const meta = { name: 'My Layout', author: 'Kevin', backcolor: '#151A21' };
      expect(roundTrip(meta)).toEqual(meta);
    });

    it('KLE intermediate row format', () => {
      // Simulates what keyPropsToIntermediate produces: a row with interleaved
      // label strings and property objects.
      const row = ['Esc', { x: 1 }, 'F1', 'F2', { x: 0.5 }, 'F5', 'F6'];
      expect(roundTrip(row)).toEqual(row);
    });
  });

  // ─── Edge Cases ───

  describe('edge cases', () => {
    it('trailing semicolons are stripped by stringify', () => {
      const s = stringify(['A', 'B']);
      expect(s).not.toMatch(/;+$/);
    });

    it('parse of empty string returns empty string', () => {
      expect(parse('')).toBe('');
    });

    it('double round-trip is stable', () => {
      const original = [[{ x: 1, y: 2 }, 'Esc', 'F1'], ['~\n`', '1', '2']];
      const pass1 = roundTrip(original);
      const pass2 = roundTrip(pass1);
      expect(pass2).toEqual(pass1);
      expect(pass2).toEqual(original);
    });

    it('triple round-trip is stable', () => {
      const original = [{ x: 2.5, y: 1.5, w: 6.25 }, '', { c: '#ff0000' }, 'Red'];
      const pass1 = roundTrip(original);
      const pass2 = roundTrip(pass1);
      const pass3 = roundTrip(pass2);
      expect(pass3).toEqual(pass2);
      expect(pass3).toEqual(original);
    });

    it('very long string', () => {
      const long = 'A'.repeat(1000);
      expect(roundTrip(long)).toBe(long);
    });

    it('deeply nested structure', () => {
      const deep = [[[[[[{ x: 1 }]]]]]];
      expect(roundTrip(deep)).toEqual(deep);
    });

    it('number-like string is preserved as string', () => {
      const result = roundTrip('123');
      expect(result).toBe('123');
      expect(typeof result).toBe('string');
    });

    it('boolean-like string is preserved as string', () => {
      const result = roundTrip('true');
      expect(result).toBe('true');
      expect(typeof result).toBe('string');
    });

    it('null-like string is preserved as string', () => {
      const result = roundTrip('null');
      expect(result).toBe('null');
      expect(typeof result).toBe('string');
    });
  });
});
