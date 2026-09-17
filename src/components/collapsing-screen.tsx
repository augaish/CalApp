import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Animated, Platform, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandHeader, BrandRow } from '@/components/brand-header';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTourTarget, type TourTargetKey } from '@/lib/tour';

/**
 * The root-tab shell. The full brand header (C02 band plus whatever the
 * screen puts in it: a date row, a schedule pill, the Food tabs) scrolls
 * away with the content instead of staying pinned, and a compact sticky
 * bar with the same four elements — logo, screen name, AI Support, Profile
 * — fades in once the band is off screen. That is the difference between a
 * workout card that starts a third of the way down the phone and one that
 * starts near the top, without dropping anything from the brand row.
 *
 * `sticky` is a control that must stay reachable while scrolled (Food's
 * Today / Meal plan tabs): it renders at the bottom of the full band and
 * again inside the compact bar.
 */
export function CollapsingScreen({
  title,
  compactTitle,
  right,
  header,
  sticky,
  stickyTourKey,
  children,
  footer,
  scrollRef,
  contentStyle,
}: {
  title: string;
  /** The compact bar's label when it should differ from the band's (Overview shows the app name in the band). */
  compactTitle?: string;
  right?: 'ai' | 'none' | ReactNode;
  /** Rendered inside the full band, under the brand row. */
  header?: ReactNode;
  sticky?: ReactNode;
  /** Lets the tour spotlight the sticky control (Food's tabs) in the band. */
  stickyTourKey?: TourTargetKey;
  children: ReactNode;
  footer?: ReactNode;
  scrollRef?: React.Ref<ScrollView>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // Tour targets: the AI Support entry in the band, and the sticky control.
  const aiTarget = useTourTarget('header.ai');
  const stickyTarget = useTourTarget(stickyTourKey ?? 'food.tabs');
  // The animated value lives in state (created once) rather than a ref, so
  // nothing reads a ref during render.
  const [scrollY] = useState(() => new Animated.Value(0));
  const [headerH, setHeaderH] = useState(0);
  const [barH, setBarH] = useState(0);
  const [barShown, setBarShown] = useState(false);

  // The compact bar takes over exactly when the band's own brand row would
  // have scrolled behind it; before either is measured, a sensible default.
  // A band with nothing under its brand row is barely taller than the bar,
  // so the floor keeps the bar hidden until the brand row has really gone.
  const threshold = headerH && barH ? Math.max(48, headerH - barH) : 120;
  const { barOpacity, barShift, onScroll } = useMemo(() => {
    const range = { inputRange: [threshold - 28, threshold], extrapolate: 'clamp' as const };
    return {
      barOpacity: scrollY.interpolate({ ...range, outputRange: [0, 1] }),
      barShift: scrollY.interpolate({ ...range, outputRange: [-8, 0] }),
      onScroll: Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        // The native driver is what keeps this smooth on a phone; the web build
        // has no native animated module and would only warn.
        useNativeDriver: Platform.OS !== 'web',
        listener: (e: { nativeEvent: { contentOffset: { y: number } } }) => {
          const shown = e.nativeEvent.contentOffset.y >= threshold - 28;
          setBarShown((prev) => (prev === shown ? prev : shown));
        },
      }),
    };
  }, [scrollY, threshold]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Animated.ScrollView
        ref={scrollRef as React.Ref<ScrollView>}
        style={{ flex: 1 }}
        contentContainerStyle={[{ paddingBottom: footer ? Spacing.md : insets.bottom + Spacing.xl }, contentStyle]}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}>
          <BrandHeader title={title} right={right} aiRef={aiTarget.bind.ref}>
            {header}
            {sticky ? (
              <View style={styles.stickyInBand} {...(stickyTourKey ? stickyTarget.bind : {})}>
                {sticky}
              </View>
            ) : null}
          </BrandHeader>
        </View>
        <View style={{ paddingHorizontal: Spacing.page, paddingTop: Spacing.sm }}>{children}</View>
      </Animated.ScrollView>

      {/* The sticky bar: absolute over the scroll, invisible and untouchable until the band is gone. */}
      <Animated.View
        pointerEvents={barShown ? 'auto' : 'none'}
        onLayout={(e) => setBarH(e.nativeEvent.layout.height)}
        style={[styles.bar, { opacity: barOpacity, transform: [{ translateY: barShift }] }]}
      >
        <LinearGradient
          colors={[theme.gradientStart, theme.gradientEnd]}
          start={{ x: 0, y: 0.4 }}
          end={{ x: 1, y: 0.6 }}
          style={[styles.barBand, { paddingTop: insets.top + Spacing.xs }]}
        >
          <BrandRow title={compactTitle ?? title} right={right} compact />
          {sticky ? <View style={styles.stickyInBar}>{sticky}</View> : null}
        </LinearGradient>
      </Animated.View>

      {footer ? (
        <View style={{ paddingHorizontal: Spacing.page, paddingTop: Spacing.sm, paddingBottom: insets.bottom + Spacing.md, backgroundColor: theme.background }}>
          {footer}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', top: 0, left: 0, right: 0 },
  barBand: { paddingHorizontal: Spacing.page, paddingBottom: Spacing.sm, borderBottomLeftRadius: Radius.lg, borderBottomRightRadius: Radius.lg },
  stickyInBand: { marginTop: Spacing.ms },
  stickyInBar: { marginTop: Spacing.sm },
});
