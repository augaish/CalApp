export type Block = { kind: 'para' | 'heading'; text: string } | { kind: 'item'; marker: string; text: string } | { kind: 'gap' };

/**
 * Splits an AI reply into paragraphs, headings and list items, for
 * components/rich-text.tsx. Pure, so it is tested on its own.
 */
export function parseBlocks(text: string): Block[] {
  const out: Block[] = [];
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) {
      if (out.length && out[out.length - 1].kind !== 'gap') out.push({ kind: 'gap' });
      continue;
    }
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    if (bullet) {
      out.push({ kind: 'item', marker: '•', text: bullet[1] });
      continue;
    }
    const numbered = line.match(/^(\d{1,2})[.)]\s+(.*)$/);
    if (numbered) {
      out.push({ kind: 'item', marker: `${numbered[1]}.`, text: numbered[2] });
      continue;
    }
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      out.push({ kind: 'heading', text: heading[1] });
      continue;
    }
    // A run of plain lines stays one paragraph, as the line breaks were written.
    const prev = out[out.length - 1];
    if (prev && prev.kind === 'para') prev.text += `\n${line}`;
    else out.push({ kind: 'para', text: line });
  }
  while (out.length && out[out.length - 1].kind === 'gap') out.pop();
  return out;
}

