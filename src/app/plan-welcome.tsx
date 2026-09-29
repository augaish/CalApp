import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Button } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { successHaptic } from '@/lib/feedback';
import { MOTTO_COUNT, scheduleWelcomeNudge, welcomeContent, type WelcomeFocus, type WelcomeTier } from '@/lib/plan-welcome';
import { useAppStore } from '@/lib/store';

const CONFETTI = ['#FFFFFF', '#E2F795', '#FFE7DA', '#FFFFFF', '#E2F795'];

/**
 * The moment after a purchase: the plan, what it unlocks, a line to start on,
 * and "Let's go" — which lands on Overview and starts the tour for someone
 * who hasn't had it. Replaces a plain "Thank you" alert.
 */
export default function PlanWelcome() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const params = useLocalSearchParams<{ tier?: string; focus?: string; trial?: string }>();
  const tier: WelcomeTier = params.tier === 'pro' || params.tier === 'proPlus' ? params.tier : 'essentials';
  const focus: WelcomeFocus = params.focus === 'food' || params.focus === 'training' ? params.focus : 'both';
  const trialDays = Number(params.trial) || 0;
  const content = welcomeContent(tier, focus, trialDays > 0);
  const name = useAppStore((s) => (s.account?.provider !== 'guest' ? s.account?.name?.split(' ')[0] : undefined));
  const [motto] = useState(() => Math.floor(Math.random() * MOTTO_COUNT));

  const [reduceMotion, setReduceMotion] = useState(false);
  const [fall] = useState(() => new Animated.Value(0));
  const [rise] = useState(() => new Animated.Value(0));
  const pieces = useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        x: ((i * 37) % 100) / 100,
        delay: (i % 7) / 7,
        drift: ((i * 53) % 60) - 30,
        spin: (i % 2 ? 1 : -1) * (180 + ((i * 29) % 180)),
        color: CONFETTI[i % CONFETTI.length],
        size: 7 + (i % 3) * 2,
      })),
    [],
  );

  useEffect(() => {
    successHaptic();
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => {
        setReduceMotion(on);
        Animated.timing(rise, { toValue: 1, duration: on ? 150 : 520, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }).start();
        if (!on) Animated.timing(fall, { toValue: 1, duration: 3200, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      })
      .catch(() => rise.setValue(1));
    void scheduleWelcomeNudge(tier, focus, trialDays > 0);
  }, [fall, rise, tier, focus, trialDays]);

  // Back to Overview; the tour follows by itself for anyone who hasn't had it
  // (use-membership-prompt.ts).
  const go = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const title = name ? t('planWelcome.titleName', { name }) : t('planWelcome.title');

  return (
    <LinearGradient colors={[theme.gradientStart, theme.gradientEnd]} start={{ x: 0, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.fill}>
      {/* Confetti: falls once; with Reduce Motion it simply rests in place. */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {pieces.map((p, i) => {
          const startY = -40 - p.delay * 220;
          const translateY = reduceMotion
            ? 60 + ((i * 71) % Math.round(height * 0.45))
            : fall.interpolate({ inputRange: [0, 1], outputRange: [startY, height * (0.35 + p.delay * 0.5)] });
          const translateX = reduceMotion ? 0 : fall.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] });
          const rotate = reduceMotion ? `${p.spin / 4}deg` : fall.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin}deg`] });
          const opacity = reduceMotion ? 0.8 : fall.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] });
          return (
            <Animated.View
              key={i}
              style={{
                position: 'absolute',
                left: p.x * width,
                top: 0,
                width: p.size,
                height: p.size * 1.8,
                borderRadius: 3,
                backgroundColor: p.color,
                opacity,
                transform: [{ translateY }, { translateX }, { rotate }],
              }}
            />
          );
        })}
      </View>

      <Animated.View
        style={[
          styles.body,
          { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.md },
          { opacity: rise, transform: [{ scale: rise.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }] },
        ]}
      >
        <Image source={require('../../assets/images/logo-tile.png')} style={styles.logo} contentFit="contain" accessibilityLabel="Calgym" />
        <View style={styles.pill}>
          <Text style={styles.pillText}>{t(content.planKey)}</Text>
        </View>
        <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
          {title}
        </Text>
        <Text style={styles.lead} maxFontSizeMultiplier={1.4}>
          {t(content.leadKey, { days: trialDays })}
        </Text>

        <View style={styles.rows}>
          {content.rows.map((r, i) => (
            <View key={r.key} style={[styles.row, i > 0 && styles.rowLine]}>
              <View style={styles.rowIcon}>
                <Icon name={r.icon} size={20} color="#FFFFFF" />
              </View>
              <Text style={styles.rowText} maxFontSizeMultiplier={1.4}>
                {t(r.key)}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.motto} maxFontSizeMultiplier={1.4}>
          {t(`planWelcome.motto.${motto}`)}
        </Text>

        <View style={{ flex: 1 }} />
        {trialDays > 0 && (
          <View style={styles.note}>
            <Icon name="notifications" size={14} color="#FFFFFF" />
            <Text style={styles.noteText} maxFontSizeMultiplier={1.4}>
              {t('planWelcome.trialNote')}
            </Text>
          </View>
        )}
        <Button label={t('planWelcome.go')} variant="secondary" onPress={go} style={styles.btn} />
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: 'hidden' },
  body: { flex: 1, alignItems: 'center', paddingHorizontal: Spacing.lg },
  logo: { width: 108, height: 108, borderRadius: 26, borderWidth: 3, borderColor: 'rgba(255,255,255,0.55)' },
  pill: { marginTop: Spacing.md, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.22)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  pillText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  title: { marginTop: Spacing.ms, color: '#FFFFFF', fontSize: 32, fontWeight: '800', textAlign: 'center', letterSpacing: -0.5 },
  lead: { marginTop: Spacing.xs, color: '#FFFFFF', opacity: 0.95, fontSize: 16, textAlign: 'center', lineHeight: 22 },
  rows: { marginTop: Spacing.lg, alignSelf: 'stretch', borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: 4, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.ms, paddingVertical: 12 },
  rowLine: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.22)' },
  rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.26)' },
  rowText: { flex: 1, color: '#FFFFFF', fontSize: 15.5, fontWeight: '600' },
  motto: { marginTop: Spacing.lg, color: '#FFFFFF', opacity: 0.95, fontSize: 15, fontStyle: 'italic', textAlign: 'center' },
  note: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.sm },
  noteText: { color: '#FFFFFF', opacity: 0.92, fontSize: 13 },
  btn: { alignSelf: 'stretch', backgroundColor: '#FFFFFF' },
});
