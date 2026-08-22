/**
 * URLON (URL Object Notation) implementation
 *
 * Uses `_` (underscore) for objects,
 * not `$` (dollar sign) as in npm urlon v3.x.
 *
 * Format:
 *   Array:  @elem1&elem2;
 *   Object: _key:value;
 *   String: =encodedText
 *   Number: :number
 *   Boolean: :true | :false
 *   null:   :null
 *
 * Special chars in strings (=:&@_;/) are escaped with / prefix,
 * then encodeURI() is applied to the whole string.
 */

/** Regex for special URLON characters that need escaping */
const URLON_SPECIAL = /([=:&@_;\/])/g;

/**
 * Encode a string for URLON format.
 * Escapes special chars with /, then applies encodeURI.
 */
function encodeURLON(str: string): string {
  return encodeURI(str.replace(URLON_SPECIAL, '/$1'));
}

/** Decode a URLON-encoded string. Equivalent to decodeURI. */
function decodeURLON(str: string): string {
  return decodeURI(str);
}

/**
 * Stringify a JavaScript value to URLON format.
 */
export function stringify(input: unknown): string {
  return _stringify(input).replace(/;+$/g, '');
}

function _stringify(input: unknown): string {
  // Number (including NaN -> serialize as null)
  if (typeof input === 'number') {
    if (isNaN(input)) return ':null';
    return ':' + String(input);
  }
  // Boolean or null
  if (input === true || input === false || input === null) {
    return ':' + String(input);
  }

  // Array
  if (Array.isArray(input)) {
    const items: string[] = [];
    for (let i = 0; i < input.length; i++) {
      items.push(_stringify(input[i]));
    }
    return '@' + items.join('&') + ';';
  }

  // Object
  if (typeof input === 'object' && input !== null) {
    const items: string[] = [];
    for (const key of Object.keys(input)) {
      const val = (input as Record<string, unknown>)[key];
      if (val !== undefined) {
        items.push(encodeURLON(key) + _stringify(val));
      }
    }
    return '_' + items.join('&') + ';';
  }

  // String (or undefined as fallback)
  const str = input !== null && input !== undefined ? String(input) : '';
  return '=' + encodeURLON(str);
}

/**
 * Parse a URLON string into a JavaScript value.
 */
export function parse(str: string): unknown {
  let pos = 0;
  str = decodeURLON(str);

  function readToken(): string {
    let token = '';
    while (pos < str.length) {
      const ch = str.charAt(pos);
      if (ch === '/') {
        pos += 1;
        if (pos >= str.length) {
          // EOF after / — return token as-is without appending ';'
          break;
        }
        token += str.charAt(pos);
        pos += 1;
      } else if (/[=:&@_;]/.test(ch)) {
        break;
      } else {
        token += ch;
        pos += 1;
      }
    }
    return token;
  }

  function parseToken(): unknown {
    if (pos >= str.length) return '';
    const type = str.charAt(pos);
    pos += 1;

    // String
    if (type === '=') {
      return readToken();
    }

    // Number, Boolean, or null
    if (type === ':') {
      const value = readToken();
      if (value === 'true') return true;
      if (value === 'false') return false;
      const num = parseFloat(value);
      return isNaN(num) ? null : num;
    }

    // Array
    if (type === '@') {
      const res: unknown[] = [];
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (pos >= str.length || str.charAt(pos) === ';') break;
        res.push(parseToken());
        if (pos >= str.length || str.charAt(pos) === ';') break;
        pos += 1; // skip &
      }
      pos += 1; // skip ;
      return res;
    }

    // Object
    if (type === '_') {
      const res: Record<string, unknown> = {};
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (pos >= str.length || str.charAt(pos) === ';') break;
        const key = readToken();
        res[key] = parseToken();
        if (pos >= str.length || str.charAt(pos) === ';') break;
        pos += 1; // skip &
      }
      pos += 1; // skip ;
      return res;
    }

    // Error
    throw new Error(`URLON parse error: unexpected character '${type}' at position ${pos - 1}`);
  }

  return parseToken();
}
