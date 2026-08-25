import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SchedulePlanCard, weekdayLabel } from '@/components/schedule-plan-card';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { coachChat, FeatureLockedError, isMockMode, QuotaError } from '@/lib/api';
import { resolveCoachSchedule } from '@/lib/coach-schedule';
import { buildCoachContext } from '@/lib/coach-context';
import { useCelebrate } from '@/lib/celebrate';
import { successHaptic } from '@/lib/feedback';
import { useEntitlement } from '@/lib/entitlement';
import { useAppStore } from '@/lib/store';
import type { ChatMessage, CoachSchedulePlan } from '@/lib/types';

export default function Coach() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const language = useAppStore((s) => s.language) ?? 'en';
  const locale = language === 'ar' ? 'ar' : 'en';
  const customExercises = useAppStore((s) => s.exercises);
  const schedule = useAppStore((s) => s.schedule);
  const applyCoachScheduleAction = useAppStore((s) => s.applyCoachSchedule);

  // Free plans can use the coach, but only a few messages a month.
  const coachUnlocked = useEntitlement((s) => s.features?.coach !== false);
  const coachCap = useEntitlement((s) => s.features?.coachCap);
  const coachUsed = useEntitlement((s) => s.features?.coachUsed ?? 0);
  const coachLeft = typeof coachCap === 'number' ? Math.max(0, coachCap - coachUsed) : null;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  // Which assistant messages' proposed plan has already been added, so the
  // card can switch to a disabled "Added" state and a second tap can't
  // duplicate the exercises on the schedule.
  const [appliedPlans, setAppliedPlans] = useState<Set<number>>(new Set());
  const scrollRef = useRef<ScrollView>(null);

  const send = async () => {
    const content = input.trim();
    if (!content || busy) return;
    if (!coachUnlocked) {
      router.push('/upgrade?reason=coach');
      return;
    }
    const next: ChatMessage[] = [...messages, { role: 'user', content }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const { reply, schedulePlan } = await coachChat(next, language, await buildCoachContext(language));
      useEntitlement.getState().spend('coach');
      const text = isMockMode
        ? t('coach.mockReply')
        // A tool-only turn can leave no lead-in text at all — the card still
        // needs a bubble above it, so a generic one stands in.
        : reply || (schedulePlan ? t('coach.schedulePlan.fallbackIntro') : reply);
      setMessages([...next, { role: 'assistant', content: text, schedulePlan }]);
    } catch (err) {
      if (err instanceof QuotaError || err instanceof FeatureLockedError) {
        useEntitlement.getState().refresh();
        setMessages(next);
        router.push(`/upgrade?reason=${err instanceof QuotaError ? 'quota' : 'coach'}`);
        return;
      }
      setMessages([...next, { role: 'assistant', content: t('common.error') }]);
    } finally {
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  /**
   * Add a proposed plan to the weekly schedule. Exercise names are resolved
   * against the library first — matched, not re-created — so a plan that
   * suggests "Bench Press" reuses the existing entry rather than spawning a
   * duplicate. A weekday the plan would overwrite is confirmed first; every
   * other weekday on the schedule is left exactly as it was.
   */
  const applySchedulePlan = (plan: CoachSchedulePlan, index: number) => {
    const resolved = resolveCoachSchedule(plan, customExercises, schedule);
    const commit = () => {
      applyCoachScheduleAction({ newExercises: resolved.newExercises, days: resolved.days });
      successHaptic();
      useCelebrate.getState().celebrate(t('coach.schedulePlan.added'));
      setAppliedPlans((prev) => new Set(prev).add(index));
    };
    if (resolved.overlapWeekdays.length === 0) {
      commit();
      return;
    }
    const days = resolved.overlapWeekdays.map((wd) => weekdayLabel(wd, locale)).join(' · ');
    Alert.alert(
      t('coach.schedulePlan.overwriteTitle'),
      t('coach.schedulePlan.overwriteBody', { days }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('coach.schedulePlan.overwriteCta'), style: 'destructive', onPress: commit },
      ],
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <View style={{ flex: 1, paddingTop: insets.top + Spacing.md }}>
        <View style={styles.titleRow}>
          <Ionicons name="sparkles" size={22} color={theme.primary} />
          <Text style={[Type.title, { color: theme.text }]}>{t('coach.title')}</Text>
        </View>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: Spacing.md, gap: Spacing.sm }}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          <Bubble role="assistant" text={t('coach.intro')} />
          {coachUnlocked && coachLeft !== null && (
            <Pressable onPress={() => router.push('/upgrade')} style={styles.creditsRow}>
              <Ionicons name="sparkles-outline" size={13} color={theme.textTertiary} />
              <Text style={{ color: theme.textTertiary, fontSize: 12 }}>
                {t('coach.messagesLeft', { count: coachLeft })}
              </Text>
            </Pressable>
          )}
          {!coachUnlocked && (
            <Pressable
              onPress={() => router.push('/upgrade?reason=coach')}
              style={[styles.lockCard, { backgroundColor: theme.card, borderColor: theme.primary }]}
            >
              <Ionicons name="lock-closed" size={22} color={theme.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15 }}>
                  {t('coach.lockedTitle')}
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                  {t('coach.lockedBody')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
            </Pressable>
          )}
          {messages.map((m, i) => (
            <View key={i} style={{ gap: Spacing.sm }}>
              <Bubble role={m.role} text={m.content} />
              {m.schedulePlan && (
                <SchedulePlanCard
                  plan={m.schedulePlan}
                  locale={locale}
                  added={appliedPlans.has(i)}
                  onAdd={() => applySchedulePlan(m.schedulePlan!, i)}
                />
              )}
            </View>
          ))}
          {busy && (
            <View style={[styles.bubble, styles.assistant, { backgroundColor: theme.card }]}>
              <ActivityIndicator color={theme.primary} />
            </View>
          )}
        </ScrollView>
        <View
          style={[
            styles.inputBar,
            {
              backgroundColor: theme.card,
              paddingBottom: Spacing.sm,
              borderTopColor: theme.border,
            },
          ]}
        >
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={t('coach.placeholder')}
            placeholderTextColor={theme.textTertiary}
            style={[styles.input, { backgroundColor: theme.background, color: theme.text }]}
            multiline
            maxLength={1000}
          />
          <Pressable
            onPress={send}
            disabled={!input.trim() || busy}
            style={({ pressed }) => [
              styles.sendBtn,
              { backgroundColor: theme.primary, opacity: !input.trim() || busy ? 0.4 : 1 },
              pressed && { transform: [{ scale: 0.92 }] },
            ]}
          >
            <Ionicons name="arrow-up" size={20} color={theme.onPrimary} />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ role, text }: { role: 'user' | 'assistant'; text: string }) {
  const theme = useTheme();
  const isUser = role === 'user';
  return (
    <View
      style={[
        styles.bubble,
        isUser
          ? [styles.user, { backgroundColor: theme.primary }]
          : [styles.assistant, { backgroundColor: theme.card }, cardShadow(theme.shadow)],
      ]}
    >
      <Text style={{ color: isUser ? theme.onPrimary : theme.text, fontSize: 15, lineHeight: 21 }}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  creditsRow: { flexDirection: 'row', alignItems: 'center', gap: 5, justifyContent: 'center' },
  lockCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1.5,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.md,
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  user: { alignSelf: 'flex-end', borderBottomEndRadius: 6 },
  assistant: { alignSelf: 'flex-start', borderBottomStartRadius: 6 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: 16,
    maxHeight: 110,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
