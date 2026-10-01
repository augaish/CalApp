import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassBacking } from '@/components/glass';
import { Icon } from '@/components/icon';
import { Radius, Spacing, TOUCH, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Translucent dark backing keeps white header text legible over the mint end
 * of the gradient (C02 "contrast backing"). */
const BACKING = 'rgba(33,27,46,0.22)';
// Glass over the pale gradient turns nearly white, and the white text on it
// disappeared. A dark tint keeps the glass but gives the text its contrast.
const GLASS_TINT = 'rgba(33,27,46,0.4)';

/**
 * C02 Brand header — the compact gradient band every root destination shares:
 * the original logo tile, the screen name, the AI Support entry and Profile.
 * `children` renders inside the band (Overview's day strip, Training's
 * schedule pill); `right` swaps the AI pill for something else (Food's date).
 */
export function BrandHeader({
  title,
  showLogo = true,
  right = 'ai',
  extra,
  children,
  bottomRadius = true,
  aiRef,
  onBack,
}: {
  title: string;
  showLogo?: boolean;
  right?: 'ai' | 'none' | ReactNode;
  /** Rendered before the AI Support pill (Food's date), so the root access pattern stays intact. */
  extra?: ReactNode;
  children?: ReactNode;
  bottomRadius?: boolean;
  aiRef?: React.Ref<View>;
  /** A pushed screen that keeps the brand band (Recipes) still needs a way back. */
  onBack?: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient
      colors={[theme.gradientStart, theme.gradientEnd]}
      start={{ x: 0, y: 0.4 }}
      end={{ x: 1, y: 0.6 }}
      style={[
        styles.band,
        { paddingTop: insets.top + Spacing.sm },
        bottomRadius && { borderBottomLeftRadius: Radius.xl, borderBottomRightRadius: Radius.xl },
      ]}
    >
      <BrandRow title={title} showLogo={showLogo} right={right} extra={extra} aiRef={aiRef} onBack={onBack} />
      {children}
    </LinearGradient>
  );
}

/**
 * The brand row on its own: logo tile, screen name, optional extra control,
 * the AI Support entry and Profile. `compact` is the sticky-bar size that
 * replaces the full band once a root screen has scrolled past it — same
 * elements, same order, same targets, smaller.
 */
export function BrandRow({
  title,
  showLogo = true,
  right = 'ai',
  extra,
  compact = false,
  aiRef,
  onBack,
}: {
  title: string;
  showLogo?: boolean;
  right?: 'ai' | 'none' | ReactNode;
  extra?: ReactNode;
  compact?: boolean;
  /** Lets the tour spotlight the AI Support entry. */
  aiRef?: React.Ref<View>;
  /** Shows a back chevron in place of the logo tile. */
  onBack?: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const size = compact ? 30 : 36;
  // The screen name comes first. When it, the AI Support label and the rest
  // don't fit on one row (Arabic, larger text, Food's date pill), the AI
  // pill drops its label and keeps its icon, rather than the name being cut.
  // Widths are measured, never guessed per language.
  const [w, setW] = useState({ row: 0, title: 0, pill: 0, extra: 0 });
  const measure = (k: keyof typeof w) => (e: LayoutChangeEvent) => {
    const v = Math.ceil(e.nativeEvent.layout.width);
    setW((cur) => (cur[k] === v ? cur : { ...cur, [k]: v }));
  };
  const lead = onBack || showLogo ? size + Spacing.sm : 0;
  // Row gaps: after the logo, either side of the spacer, before the avatar (and after Food's pill).
  const fixed = lead + size + 3 * Spacing.sm + (extra ? w.extra + Spacing.sm : 0);
  const aiIconOnly = right === 'ai' && w.row > 0 && w.title + w.pill + fixed > w.row;
  return (
    <View style={[styles.row, compact && { minHeight: 40 }]} onLayout={measure('row')}>
      {/* Invisible copies, only to know how wide the full name and label are. */}
      <View style={styles.measure} pointerEvents="none" aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text maxFontSizeMultiplier={1.3} style={[styles.brand, compact && { fontSize: 18 }]} onLayout={measure('title')}>
          {title}
        </Text>
        {right === 'ai' && (
          <View style={[styles.pill, { minHeight: size }]} onLayout={measure('pill')}>
            <Icon name="sparkles" size={15} color="transparent" />
            <Text maxFontSizeMultiplier={1.3} style={styles.pillText}>{t('tabs.ai')}</Text>
          </View>
        )}
      </View>
      {onBack && (
        <Pressable
          onPress={onBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={({ pressed }) => [styles.brandBack, { width: size, height: size, borderRadius: size / 2 }, pressed && { opacity: 0.7 }]}
        >
          <GlassBacking radius={size / 2} fallbackColor={BACKING} tint={GLASS_TINT} />
          <Icon name="chevron-back" size={compact ? 18 : 22} color={theme.onGradient} />
        </Pressable>
      )}
      {showLogo && !onBack && (
        <Image
          source={require('../../assets/images/logo-tile.png')}
          style={[styles.logo, { width: size, height: size, borderRadius: compact ? 8 : 9 }]}
          contentFit="contain"
          accessibilityLabel="Calgym"
        />
      )}
      <Text maxFontSizeMultiplier={1.3} style={[styles.brand, compact && { fontSize: 18 }, { color: theme.onGradient, flexShrink: 1 }]} numberOfLines={1}>
        {title}
      </Text>
      <View style={{ flex: 1 }} />
      {extra ? <View onLayout={measure('extra')}>{extra}</View> : null}
      {right === 'ai' ? (
        <View ref={aiRef} collapsable={false}>
          <Pressable
            onPress={() => router.push('/coach')}
            accessibilityRole="button"
            accessibilityLabel={t('tabs.ai')}
            style={({ pressed }) => [
              styles.pill,
              { minHeight: size },
              aiIconOnly && { width: size, paddingHorizontal: 0, justifyContent: 'center' },
              pressed && { opacity: 0.8 },
            ]}
          >
            <GlassBacking radius={size / 2} fallbackColor={BACKING} tint={GLASS_TINT} />
            <Icon name="sparkles" size={15} color={theme.onGradient} />
            {!aiIconOnly && (
              <Text maxFontSizeMultiplier={1.3} style={[styles.pillText, { color: theme.onGradient }]}>{t('tabs.ai')}</Text>
            )}
          </Pressable>
        </View>
      ) : right === 'none' ? null : (
        right
      )}
      <Pressable
        onPress={() => router.push('/profile')}
        accessibilityRole="button"
        accessibilityLabel={t('profile.title')}
        style={({ pressed }) => [styles.avatar, { width: size, height: size, borderRadius: size / 2 }, pressed && { opacity: 0.8 }]}
      >
        <GlassBacking radius={size / 2} fallbackColor={BACKING} tint={GLASS_TINT} />
        <Icon name="person" size={compact ? 16 : 18} color={theme.onGradient} />
      </Pressable>
    </View>
  );
}

/** A translucent header pill with an icon and text (Food's date, Training's schedule). */
export function HeaderPill({
  icon,
  label,
  onPress,
  accessibilityLabel,
  trailing,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  trailing?: keyof typeof Ionicons.glyphMap;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [styles.pill, pressed && { opacity: 0.8 }]}
    >
      <GlassBacking radius={18} fallbackColor={BACKING} tint={GLASS_TINT} />
      <Icon name={icon} size={15} color={theme.onGradient} />
      <Text maxFontSizeMultiplier={1.3} style={[styles.pillText, { color: theme.onGradient }]} numberOfLines={1}>
        {label}
      </Text>
      {trailing && <Icon name={trailing} size={13} color={theme.onGradient} />}
    </Pressable>
  );
}

/** Shown on the gradient while you look at another day: one tap back to today. */
export function TodayPill({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={t('home.backToToday')}
      style={({ pressed }) => [styles.pill, styles.todayPill, pressed && { opacity: 0.8 }]}
    >
      <GlassBacking radius={16} fallbackColor={BACKING} tint={GLASS_TINT} />
      <Text maxFontSizeMultiplier={1.3} style={[styles.pillText, { color: theme.onGradient }]} numberOfLines={1}>
        {t('home.today')}
      </Text>
    </Pressable>
  );
}

/**
 * Secondary-screen header: a visible Back/Close control, the screen name and
 * an optional right action. Gradient by default (forms, sessions, previews);
 * `plain` for browsing screens that sit on the page background.
 */
export function PageHeader({
  title,
  subtitle,
  onBack,
  backLabel,
  close = false,
  right,
  variant = 'gradient',
  children,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  /** Show an X instead of a chevron (modal forms). */
  close?: boolean;
  right?: ReactNode;
  variant?: 'gradient' | 'plain';
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const ink = variant === 'gradient' ? theme.onGradient : theme.text;
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));
  // The title is centred on the screen, so it is kept clear of the wider of
  // the two sides (Back and the right action); a long title — Arabic ones
  // often are — then shrinks a little and ends in "…" in the space between,
  // instead of running underneath the buttons.
  const [sides, setSides] = useState({ start: 0, end: 0 });
  const inset = Math.max(sides.start, sides.end, TOUCH) + Spacing.xs;
  const inner = (
    <>
      <View style={styles.row}>
        <Pressable
          onPress={back}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={backLabel ?? (close ? t('common.close') : t('common.back'))}
          style={({ pressed }) => [styles.back, pressed && { opacity: 0.7 }]}
          onLayout={(e) => {
            const w = Math.ceil(e.nativeEvent.layout.width);
            setSides((cur) => (cur.start === w ? cur : { ...cur, start: w }));
          }}
        >
          <Icon name={close ? 'close' : 'chevron-back'} size={24} color={ink} />
          {!close && (
            <Text maxFontSizeMultiplier={1.3} style={{ color: ink, fontSize: 15, fontWeight: '600' }}>{backLabel ?? t('common.back')}</Text>
          )}
        </Pressable>
        <View style={[styles.titleWrap, { paddingHorizontal: inset }]} pointerEvents="none">
          <Text maxFontSizeMultiplier={1.3} style={[styles.pageTitle, { color: ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {title}
          </Text>
          {!!subtitle && (
            <Text maxFontSizeMultiplier={1.3} style={[styles.pageSubtitle, { color: variant === 'gradient' ? 'rgba(255,255,255,0.85)' : theme.textSecondary }]} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
        {/* A spacer, not marginStart: 'auto', keeps the right-hand action at
            the far edge in either direction — the web build reads start
            margins left-to-right even when the page is Arabic. */}
        <View style={styles.spacer} pointerEvents="none" />
        <View
          style={styles.rightSlot}
          onLayout={(e) => {
            const w = right ? Math.ceil(e.nativeEvent.layout.width) : 0;
            setSides((cur) => (cur.end === w ? cur : { ...cur, end: w }));
          }}
        >
          {right}
        </View>
      </View>
      {children}
    </>
  );
  if (variant === 'plain') {
    return (
      <View style={[styles.band, { paddingTop: insets.top + Spacing.sm, backgroundColor: theme.background }]}>{inner}</View>
    );
  }
  return (
    <LinearGradient
      colors={[theme.gradientStart, theme.gradientEnd]}
      start={{ x: 0, y: 0.4 }}
      end={{ x: 1, y: 0.6 }}
      style={[styles.band, { paddingTop: insets.top + Spacing.sm, borderBottomLeftRadius: Radius.lg, borderBottomRightRadius: Radius.lg }]}
    >
      {inner}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  brandBack: { alignItems: 'center', justifyContent: 'center' },
  measure: { position: 'absolute', opacity: 0, flexDirection: 'row', start: 0, top: 0 },
  band: { paddingHorizontal: Spacing.page, paddingBottom: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: TOUCH },
  logo: { width: 36, height: 36, borderRadius: 9 },
  brand: { ...Type.section, fontSize: 22 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 36,
    borderRadius: Radius.pill,
    maxWidth: 190,
    flexShrink: 1,
  },
  pillText: { fontSize: 13, fontWeight: '700' },
  todayPill: { minHeight: 32, paddingHorizontal: 12, flexShrink: 0 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', minHeight: TOUCH, minWidth: TOUCH, gap: 2, zIndex: 1 },
  titleWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pageTitle: { fontSize: 18, fontWeight: '800' },
  pageSubtitle: { fontSize: 12, fontWeight: '600' },
  spacer: { flex: 1 },
  rightSlot: { minWidth: TOUCH, alignItems: 'flex-end', zIndex: 1 },
});
