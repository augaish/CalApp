import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type FoodIllustration = 'bowl' | 'plate' | 'sandwich' | 'drink' | 'fruit' | 'packaged' | 'generic';

const GLYPH: Record<FoodIllustration, keyof typeof Ionicons.glyphMap> = {
  bowl: 'restaurant-outline',
  plate: 'pizza-outline',
  sandwich: 'fast-food-outline',
  drink: 'cafe-outline',
  fruit: 'nutrition-outline',
  packaged: 'cube-outline',
  generic: 'restaurant-outline',
};

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
