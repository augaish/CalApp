import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, type TextStyle } from 'react-native';

import { Radius, Spacing, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCelebrate } from '@/lib/celebrate';

/**
 * Lightweight celebratory toast — a pill that springs in near the top when
 * something is logged, then fades out. Rendered once at the app root so it
 * floats above every screen (including modals). Non-interactive.
 */
export function Celebration() {
  const message = useCelebrate((s) => s.message);
  const clear = useCelebrate((s) => s.clear);
  const theme = useTheme();
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!message) return;
    anim.setValue(0);
    const run = Animated.sequence([
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 7, tension: 80 }),
      Animated.delay(1300),
      Animated.timing(anim, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]);
    run.start(({ finished }) => {
      if (finished) clear();
    });
    return () => run.stop();
  }, [message, anim, clear]);

  if (!message) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
        },
      ]}
    >
      <Text style={[styles.pill, { backgroundColor: theme.primary, color: theme.onPrimary }, cardShadow(theme.shadow) as TextStyle]}>
        {message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 64, left: 0, right: 0, alignItems: 'center', zIndex: 1000 },
  pill: {
    fontSize: 15,
    fontWeight: '800',
    overflow: 'hidden',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
  },
});
