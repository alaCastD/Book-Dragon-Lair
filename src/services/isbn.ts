/**
 * ISBN helpers. Book barcodes are EAN-13 codes whose digits are the ISBN-13
 * (starting 978 or 979). Older books may print a 10-digit ISBN instead.
 */

function isbn13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

/** Strips spaces and hyphens, uppercases a trailing x. */
export function cleanIsbn(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

export function isValidIsbn13(isbn: string): boolean {
  if (!/^97[89]\d{10}$/.test(isbn)) return false;
  return isbn13CheckDigit(isbn.slice(0, 12)) === Number(isbn[12]);
}

export function isValidIsbn10(isbn: string): boolean {
  if (!/^\d{9}[\dX]$/.test(isbn)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const v = isbn[i] === 'X' ? 10 : Number(isbn[i]);
    sum += v * (10 - i);
  }
  return sum % 11 === 0;
}

export function isbn10To13(isbn10: string): string {
  const first12 = '978' + isbn10.slice(0, 9);
  return first12 + isbn13CheckDigit(first12);
}

export type ParseResult =
  | { ok: true; isbn: string }
  | { ok: false; reason: 'not-a-book' | 'invalid' };

/**
 * Turns a scanned barcode or typed number into a canonical ISBN-13.
 * - `not-a-book`: a valid barcode, but not an ISBN (e.g. a price or UPC code).
 * - `invalid`: digits that fail the ISBN check (misread or mistyped).
 */
export function parseIsbn(raw: string): ParseResult {
  const s = cleanIsbn(raw);
  if (s.length === 13) {
    if (!/^\d{13}$/.test(s)) return { ok: false, reason: 'invalid' };
    if (!/^97[89]/.test(s)) return { ok: false, reason: 'not-a-book' };
    return isValidIsbn13(s) ? { ok: true, isbn: s } : { ok: false, reason: 'invalid' };
  }
  if (s.length === 10) {
    return isValidIsbn10(s) ? { ok: true, isbn: isbn10To13(s) } : { ok: false, reason: 'invalid' };
  }
  // UPC-A (12 digits) and EAN-8 codes are never ISBNs; the small 5-digit
  // price barcode next to the ISBN is also commonly picked up.
  if (/^\d+$/.test(s) && (s.length === 12 || s.length === 8 || s.length === 5)) {
    return { ok: false, reason: 'not-a-book' };
  }
  return { ok: false, reason: 'invalid' };
}

/** "978-0-441-17271-9"-style grouping is publisher-specific; this just spaces it for reading. */
export function formatIsbn(isbn: string): string {
  return isbn.length === 13 ? `${isbn.slice(0, 3)}-${isbn.slice(3)}` : isbn;
}
