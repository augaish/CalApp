import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, StepDots } from '@/components/ui';
import { Spacing, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { lightHaptic, successHaptic } from '@/lib/feedback';
import { useAppStore } from '@/lib/store';

const SLIDES = [
  { key: 'meal', icon: 'camera' },
  { key: 'gym', icon: 'barbell' },
  { key: 'plan', icon: 'stats-chart' },
  { key: 'coach', icon: 'sparkles' },
] as const;

export default function Welcome() {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const setTutorialSeen = useAppStore((s) => s.setTutorialSeen);

  const [index, setIndex] = useState(0);
  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;

  const next = () => {
    if (isLast) {
      successHaptic();
      setTutorialSeen();
    } else {
      lightHaptic();
      setIndex((i) => i + 1);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.top, { paddingTop: insets.top + Spacing.sm }]}>
        <Pressable onPress={setTutorialSeen} hitSlop={10} style={styles.skip}>
          <Text style={{ color: theme.textSecondary, fontSize: 15, fontWeight: '600' }}>
            {t('tutorial.skip')}
          </Text>
        </Pressable>
      </View>

      <View style={styles.center}>
        <LinearGradient
          colors={[theme.gradientStart, theme.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.circle}
        >
          <Ionicons name={slide.icon} size={68} color={theme.onGradient} />
        </LinearGradient>

        <Text style={[Type.title, styles.title, { color: theme.text }]}>
          {t(`tutorial.slides.${slide.key}.title`)}
        </Text>
        <Text style={[styles.body, { color: theme.textSecondary }]}>
          {t(`tutorial.slides.${slide.key}.body`)}
        </Text>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <View style={styles.dots}>
          <StepDots total={SLIDES.length} current={index} />
        </View>
        <Button label={isLast ? t('tutorial.start') : t('tutorial.next')} onPress={next} />
        {index > 0 && (
          <Button
            label={t('common.back')}
            variant="ghost"
            onPress={() => setIndex((i) => i - 1)}
            style={{ marginTop: Spacing.xs }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  top: { paddingHorizontal: Spacing.md, alignItems: 'flex-end', minHeight: 44 },
  skip: { padding: Spacing.sm },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.lg,
  },
  circle: {
    width: 148,
    height: 148,
    borderRadius: 74,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { textAlign: 'center', fontSize: 28 },
  body: { textAlign: 'center', fontSize: 16, lineHeight: 24 },
  bottom: { paddingHorizontal: Spacing.lg },
  dots: { alignItems: 'center' },
});
