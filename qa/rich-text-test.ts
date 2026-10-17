// AI replies: **bold**, bullets, numbered lines and headings become blocks.
import { parseBlocks } from '../src/lib/rich-text';

let fails = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  → ${detail}` : ''}`);
};
const reply = "Good question — it's about grip angle:\n\n- **Horizontal handle**: outer lats\n- **Vertical handle**: mid-back\n\n### Tip\n1. Start light\n2. Squeeze";
const b = parseBlocks(reply);
check('paragraph, gap, two bullets, gap, heading, two numbered', b.map((x) => x.kind).join() === 'para,gap,item,item,gap,heading,item,item', b.map((x) => x.kind).join());
check('bullet text keeps its bold markers for the inline pass', b[2].kind === 'item' && b[2].text === '**Horizontal handle**: outer lats');
check('numbered marker', b[6].kind === 'item' && b[6].marker === '1.');
check('plain message is one paragraph', parseBlocks('Hello there').length === 1);
check('lines without a blank stay one paragraph', parseBlocks('a\nb').length === 1);
check('Arabic bullet', parseBlocks('- **تمرين**: ظهر')[0].kind === 'item');
console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
process.exit(fails ? 1 : 0);
