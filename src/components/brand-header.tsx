import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Spacing, TOUCH, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Translucent dark backing keeps white header text legible over the mint end
 * of the gradient (C02 "contrast backing"). */
const BACKING = 'rgba(33,27,46,0.22)';

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
}: {
  title: string;
  showLogo?: boolean;
  right?: 'ai' | 'none' | ReactNode;
  /** Rendered before the AI Support pill (Food's date), so the root access pattern stays intact. */
  extra?: ReactNode;
  children?: ReactNode;
  bottomRadius?: boolean;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
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
      <View style={styles.row}>
        {showLogo && (
          <Image
            source={require('../../assets/images/logo-tile.png')}
            style={styles.logo}
            contentFit="contain"
            accessibilityLabel="Calgym"
          />
        )}
        <Text style={[styles.brand, { color: theme.onGradient }]} numberOfLines={1}>
          {title}
        </Text>
        <View style={{ flex: 1 }} />
        {extra}
        {right === 'ai' ? (
          <Pressable
            onPress={() => router.push('/coach')}
            accessibilityRole="button"
            accessibilityLabel={t('tabs.ai')}
            style={({ pressed }) => [styles.pill, { backgroundColor: BACKING }, pressed && { opacity: 0.8 }]}
          >
            <Ionicons name="sparkles" size={15} color={theme.onGradient} />
            <Text style={[styles.pillText, { color: theme.onGradient }]}>{t('tabs.ai')}</Text>
          </Pressable>
        ) : right === 'none' ? null : (
          right
        )}
        <Pressable
          onPress={() => router.push('/profile')}
          accessibilityRole="button"
          accessibilityLabel={t('profile.title')}
          style={({ pressed }) => [styles.avatar, { backgroundColor: BACKING }, pressed && { opacity: 0.8 }]}
        >
          <Ionicons name="person" size={18} color={theme.onGradient} />
        </Pressable>
      </View>
      {children}
    </LinearGradient>
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
      style={({ pressed }) => [styles.pill, { backgroundColor: BACKING }, pressed && { opacity: 0.8 }]}
    >
      <Ionicons name={icon} size={15} color={theme.onGradient} />
      <Text style={[styles.pillText, { color: theme.onGradient }]} numberOfLines={1}>
        {label}
      </Text>
      {trailing && <Ionicons name={trailing} size={13} color={theme.onGradient} />}
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
  const inner = (
    <>
      <View style={styles.row}>
        <Pressable
          onPress={back}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={backLabel ?? (close ? t('common.close') : t('common.back'))}
          style={({ pressed }) => [styles.back, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name={close ? 'close' : 'chevron-back'} size={24} color={ink} />
          {!close && (
            <Text style={{ color: ink, fontSize: 15, fontWeight: '600' }}>{backLabel ?? t('common.back')}</Text>
          )}
        </Pressable>
        <View style={styles.titleWrap} pointerEvents="none">
          <Text style={[styles.pageTitle, { color: ink }]} numberOfLines={1}>
            {title}
          </Text>
          {!!subtitle && (
            <Text style={[styles.pageSubtitle, { color: variant === 'gradient' ? 'rgba(255,255,255,0.85)' : theme.textSecondary }]} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
        <View style={styles.rightSlot}>{right}</View>
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
  band: { paddingHorizontal: Spacing.page, paddingBottom: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: TOUCH },
  logo: { width: 36, height: 36, borderRadius: 9 },
  brand: { ...Type.section, fontSize: 22 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    height: 36,
    borderRadius: Radius.pill,
    maxWidth: 190,
    flexShrink: 1,
  },
  pillText: { fontSize: 13, fontWeight: '700' },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', minHeight: TOUCH, minWidth: TOUCH, gap: 2, zIndex: 1 },
  titleWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  pageTitle: { fontSize: 18, fontWeight: '800' },
  pageSubtitle: { fontSize: 12, fontWeight: '600' },
  rightSlot: { marginStart: 'auto', minWidth: TOUCH, alignItems: 'flex-end', zIndex: 1 },
});
