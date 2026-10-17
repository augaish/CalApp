import { StyleSheet, View, type TextStyle } from 'react-native';

import { Text } from '@/components/text';
import { parseBlocks } from '@/lib/rich-text';

/**
 * The light formatting AI replies use, drawn instead of shown as symbols:
 * **bold**, "- " / "* " / "• " bullets, "1. " numbered lines and "#" headings.
 * Anything else is plain text, so an ordinary message looks as it did.
 */
export function RichText({ text, style, rtl }: { text: string; style: TextStyle; rtl: boolean }) {
  const align: TextStyle = { textAlign: rtl ? 'right' : 'left', writingDirection: rtl ? 'rtl' : 'ltr' };
  const blocks = parseBlocks(text);
  return (
    <View style={{ gap: 6 }}>
      {blocks.map((b, i) => {
        if (b.kind === 'gap') return <View key={i} style={{ height: 2 }} />;
        if (b.kind === 'item') {
          // The marker is part of the line, so it sits at the line's start in
          // either direction (Arabic on the right) without any layout guessing.
          return (
            <Text key={i} style={[style, align]}>
              <Text style={styles.marker}>{`${b.marker}\u00A0 `}</Text>
              {inline(b.text)}
            </Text>
          );
        }
        return (
          <Text key={i} style={[style, align, b.kind === 'heading' && styles.heading]}>
            {inline(b.text)}
          </Text>
        );
      })}
    </View>
  );
}

/** **bold** as bold; stray single asterisks and backticks are dropped. */
function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') && p.length > 4 ? (
      <Text key={i} style={styles.bold}>
        {p.slice(2, -2)}
      </Text>
    ) : (
      p.replace(/(^|[\s(])\*(?=\S)([^*]+?)\*(?=[\s).,!?:;]|$)/g, '$1$2').replace(/`/g, '')
    ),
  );
}

const styles = StyleSheet.create({
  marker: { fontWeight: '700' },
  heading: { fontWeight: '800' },
  bold: { fontWeight: '700' },
});
