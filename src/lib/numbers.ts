const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const EXTENDED_ARABIC_INDIC = '۰۱۲۳۴۵۶۷۸۹';

/**
 * Numeric text fields only understand ASCII digits (parseInt/parseFloat
 * silently fail on Arabic-Indic ones), but Arabic keyboards default to them.
 * Convert both digit sets — and the Arabic decimal separator — to their
 * Western equivalents so typing in Arabic numerals still works.
 */
export function normalizeDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (c) => String(ARABIC_INDIC.indexOf(c)))
    .replace(/[۰-۹]/g, (c) => String(EXTENDED_ARABIC_INDIC.indexOf(c)))
    .replace(/٫/g, '.');
}
