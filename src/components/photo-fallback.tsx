import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type FoodIllustration = 'bowl' | 'plate' | 'sandwich' | 'drink' | 'fruit' | 'packaged' | 'fish' | 'egg' | 'pizza' | 'generic';

const GLYPH: Record<FoodIllustration, keyof typeof Ionicons.glyphMap> = {
  bowl: 'restaurant',
  plate: 'restaurant-outline',
  fish: 'fish-outline',
  egg: 'egg-outline',
  pizza: 'pizza-outline',
  sandwich: 'fast-food-outline',
  drink: 'cafe-outline',
  fruit: 'nutrition-outline',
  packaged: 'cube-outline',
  generic: 'restaurant-outline',
};

const KEYWORDS: [FoodIllustration, RegExp][] = [
  ['drink', /\b(juice|smoothie|shake|coffee|tea|latte|water|milk|عصير|قهوة|شاي|حليب|مشروب)\b/i],
  ['sandwich', /\b(sandwich|wrap|burger|toast|shawarma|ساندويتش|شاورما|برجر|لفافة|توست)\b/i],
  ['fruit', /\b(fruit|apple|banana|berry|berries|dates|mango|salad|فواكه|فاكهة|تمر|موز|تفاح|سلطة)\b/i],
  ['packaged', /\b(bar|chips|biscuit|cereal|yogurt|yoghurt|بسكويت|زبادي|شيبس|حبوب)\b/i],
  ['pizza', /\b(pizza|manakish|manakeesh|بيتزا|مناقيش)\b/i],
  ['fish', /\b(fish|salmon|tuna|hammour|shrimp|prawn|سمك|سلمون|تونة|هامور|روبيان|جمبري)\b/i],
  ['egg', /\b(egg|eggs|omelette|omelet|shakshuka|بيض|عجة|شكشوكة)\b/i],
  ['bowl', /\b(soup|stew|bowl|porridge|oats|lentil|harees|شوربة|يخنة|عدس|هريس|شوفان|طبق)\b/i],
];

/** A bundled category for a dish name — a stable, language-independent key. */
export function illustrationFor(name: string | undefined): FoodIllustration {
  if (!name) return 'generic';
  for (const [kind, re] of KEYWORDS) if (re.test(name)) return kind;
  return 'plate';
}

/**
 * A photo when there is one, a bundled category illustration when there is
 * not (C09). Same geometry either way, so a list never reflows when an image
 * fails or was never attached, and no blank hole, broken-image badge or
 * prompt to buy a picture. Never triggers an image request of its own: this
 * is decoration, and nutrition does not depend on it.
 */
export function PhotoFallback({
  uri,
  illustration = 'generic',
  size = 56,
  accessibilityLabel,
}: {
  uri?: string;
  illustration?: FoodIllustration;
  size?: number;
  /** Omit when the dish name sits beside the image; a reader would hear it twice. */
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const [failed, setFailed] = useState(false);
  const showImage = !!uri && !failed;
  return (
    <View
      style={[styles.box, { width: size, height: size, backgroundColor: theme.cardSubtle }]}
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
    >
      {showImage ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size }}
          contentFit="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Ionicons name={GLYPH[illustration]} size={Math.round(size * 0.42)} color={theme.primary} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
