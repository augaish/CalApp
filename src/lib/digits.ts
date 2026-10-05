/**
 * Arabic-Indic digits for Arabic. The app shows numbers as ٦٦٤ / ٢٬٥٢٥ in
 * Arabic everywhere — not a mix of ٦٦٤ (from number formatting) and 32 (from
 * plain text) on one card.
 *
 * Only digits that are numbers in the sentence change. Digits that belong to
 * Latin text stay as written: "B12", "7UP", "V60", "Machine 7", an email or
 * a web address, and anything marked latinDigits (codes, versions).
 */
const AR = '٠١٢٣٤٥٦٧٨٩';
const NUMBER = /[0-9]+(?:[.,][0-9]+)*%?/g;
const LATIN = /[A-Za-z]/;

export function toArabicDigits(text: string): string {
  if (!/[0-9]/.test(text)) return text;
  // An email or a web address is an identifier, not a number.
  if (/@|:\/\/|www\./i.test(text)) return text;
  return text.replace(NUMBER, (run, offset: number) => {
    const before = text[offset - 1] ?? '';
    const after = text[offset + run.length] ?? '';
    if (LATIN.test(before) || LATIN.test(after)) return run;
    // A number that ends a Latin name ("Machine 7", "InBody 270") is part of it.
    if (/[A-Za-z][A-Za-z'’.-]* $/.test(text.slice(Math.max(0, offset - 40), offset))) return run;
    // A version number (1.0.0) is an identifier too.
    if (/^\d+\.\d+\.\d+/.test(run)) return run;
    return run.replace(/[0-9]/g, (d) => AR[Number(d)]).replace(/\./g, '٫').replace(/,/g, '٬').replace(/%$/, '٪');
  });
}
