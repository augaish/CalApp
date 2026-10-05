import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { Radius, Spacing, tracking } from '@/constants/theme';

export type HeroState = 'start' | 'resume' | 'done' | 'rest';

/**
 * Overview's lead card: the day's training in one place, with the one action
 * that fits the day — Start, Resume, a look at what was done, or adding
 * something on a rest day. It follows the records, so it never offers to
 * start a workout that is already done.
 */
export function WorkoutHero({
  state,
  title,
  sub,
  onOpen,
  onAction,
  bind,
}: {
  state: HeroState;
  title: string;
  sub: string;
  onOpen: () => void;
  onAction: () => void;
  bind?: object;
}) {
  const { t } = useTranslation();
  const calm = state === 'done' || state === 'rest';
  const eyebrow = { start: t('hero.next'), resume: t('hero.inProgress'), done: t('hero.doneToday'), rest: t('hero.restDay') }[state];
  const action = { start: t('today.startWorkout'), resume: t('session.resume'), done: t('hero.viewWorkout'), rest: t('today.addExercise') }[state];
  const actionIcon = { start: 'play', resume: 'play', done: 'checkmark-circle', rest: 'add' } as const;
  const art = { start: 'barbell', resume: 'barbell', done: 'checkmark-done', rest: 'bed-outline' } as const;

  return (
    <View {...bind} style={styles.wrap}>
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${eyebrow} · ${title} · ${sub}`} style={({ pressed }) => [pressed && { opacity: 0.92 }]}>
        <LinearGradient
          colors={calm ? ['#8C7BC4', '#7A68B5'] : ['#6D5AAB', '#59478F']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <View style={styles.art} pointerEvents="none">
            <Icon name={art[state]} size={52} color="rgba(255,255,255,0.72)" />
          </View>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.sub} numberOfLines={2}>
            {sub}
          </Text>
          <Pressable
            onPress={onAction}
            accessibilityRole="button"
            accessibilityLabel={action}
            style={({ pressed }) => [styles.action, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
          >
            <Icon name={actionIcon[state]} size={17} color="#59478F" />
            <Text style={styles.actionText}>{action}</Text>
          </Pressable>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: Spacing.md },
  card: { borderRadius: Radius.lg + 2, padding: Spacing.md, paddingBottom: Spacing.md + 2, overflow: 'hidden', minHeight: 168 },
  art: { position: 'absolute', end: -18, bottom: -20, width: 124, height: 124, borderRadius: 62, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: 'rgba(255,255,255,0.82)', fontSize: 11, fontWeight: '800', letterSpacing: tracking(0.7), textTransform: 'uppercase' },
  title: { color: '#fff', fontSize: 27, fontWeight: '800', letterSpacing: tracking(-0.5), marginTop: 6, marginEnd: 70 },
  sub: { color: 'rgba(255,255,255,0.9)', fontSize: 13.5, fontWeight: '600', marginTop: 3, marginEnd: 70 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', backgroundColor: '#fff', borderRadius: Radius.full, paddingVertical: 11, paddingHorizontal: 18, marginTop: Spacing.md, minHeight: 44 },
  actionText: { color: '#59478F', fontWeight: '800', fontSize: 14.5 },
});
