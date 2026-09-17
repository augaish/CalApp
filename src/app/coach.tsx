import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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

import { BrandHeader, HeaderPill } from '@/components/brand-header';
import { SchedulePlanCard, weekdayLabel } from '@/components/schedule-plan-card';
import { ActionButton, IconTile, RowGroup, Segmented, SettingsRow } from '@/components/system';
import { Radius, Spacing, TOUCH, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { analyzeCoachAttachment, coachChat, FeatureLockedError, isMockMode, QuotaError } from '@/lib/api';
import { aiFailureAction } from '@/lib/api-errors';
import { resolveCoachSchedule } from '@/lib/coach-schedule';
import { buildCoachContext } from '@/lib/coach-context';
import { useCelebrate } from '@/lib/celebrate';
import { documentPickerAvailable, pickReportBase64 } from '@/lib/document-picker';
import { successHaptic } from '@/lib/feedback';
import { useEntitlement } from '@/lib/entitlement';
import { MAX_COACH_REFERENCE_DOCS, useAppStore } from '@/lib/store';
import type { ChatMessage, CoachFocus, CoachSchedulePlan } from '@/lib/types';

const FOCUS: CoachFocus[] = ['food', 'training', 'health'];
const FOCUS_ICON: Record<CoachFocus, keyof typeof Ionicons.glyphMap> = { food: 'restaurant', training: 'barbell', health: 'heart-outline' };

/** Timestamp for a sent message; module-level so the clock is never read during render. */
const nowIso = () => new Date().toISOString();

/**
 * S18 AI Support — clearly labelled AI, the remaining allowance from the live
 * entitlement, a chosen context (Food, Training, Health) that steers the
 * reply, and proposals that stay drafts until the person reviews them in the
 * existing apply flows. Failed requests keep the typed text and say what kind
 * of failure it was; nothing here edits a plan or a log on its own.
 */
export default function Coach() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { prompt: openingPrompt, focus: focusParam } = useLocalSearchParams<{ prompt?: string; focus?: string }>();
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

  const messages = useAppStore((s) => s.coachMessages);
  const setMessages = useAppStore((s) => s.setCoachMessages);
  const resetCoachChat = useAppStore((s) => s.resetCoachChat);
  const appliedPlans = useAppStore((s) => s.coachAppliedPlans);
  const markCoachPlanApplied = useAppStore((s) => s.markCoachPlanApplied);
  const referenceDocs = useAppStore((s) => s.coachReferenceDocs);
  const addCoachReferenceDoc = useAppStore((s) => s.addCoachReferenceDoc);
  const [focus, setFocus] = useState<CoachFocus>(FOCUS.includes(focusParam as CoachFocus) ? (focusParam as CoachFocus) : 'food');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [attachStage, setAttachStage] = useState<'idle' | 'picking' | 'reading'>('idle');
  const [openDrafts, setOpenDrafts] = useState<number[]>([]);
  const scrollRef = useRef<ScrollView>(null);

  const send = async (override?: string) => {
    const content = (override ?? input).trim();
    if (!content || busy) return;
    if (!coachUnlocked) {
      router.push('/upgrade?reason=coach');
      return;
    }
    const next: ChatMessage[] = [...messages, { role: 'user', content, at: nowIso(), focus }];
    setMessages(next);
    if (override == null) setInput('');
    setBusy(true);
    try {
      const { reply, schedulePlan } = await coachChat(next, language, await buildCoachContext(language, 7, focus));
      useEntitlement.getState().spend('coach');
      const text = isMockMode ? t('coach.mockReply') : reply || (schedulePlan ? t('coach.schedulePlan.fallbackIntro') : reply);
      setMessages([...next, { role: 'assistant', content: text, schedulePlan, at: nowIso() }]);
    } catch (err) {
      const action = aiFailureAction(err, { titleKey: 'common.error', bodyKey: 'common.error' });
      if (action.kind === 'upgrade') {
        useEntitlement.getState().refresh();
        // Keep the typed question so nothing is lost on the way to Upgrade.
        setMessages(messages);
        setInput(content);
        router.push(`/upgrade?reason=${action.reason}`);
        return;
      }
      // The failure category is the reply: quota, account credit and service
      // configuration are named as such and never told to "try again".
      setMessages([...next, { role: 'assistant', content: `${t(action.titleKey)} ${t(action.bodyKey, action.values ?? {})}`, at: nowIso() }]);
    } finally {
      setBusy(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  // A deep-link opening prompt (e.g. from the body-reading screen's "Ask
  // coach" button) is sent once, automatically, on arrival.
  useEffect(() => {
    if (!openingPrompt) return;
    const id = setTimeout(() => send(openingPrompt), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Add a reviewed plan to the weekly schedule. Exercise names are resolved
   * against the library first, and a weekday the plan would overwrite is
   * confirmed before anything changes.
   */
  const applySchedulePlan = (plan: CoachSchedulePlan, index: number) => {
    const resolved = resolveCoachSchedule(plan, customExercises, schedule);
    const commit = () => {
      applyCoachScheduleAction({ newExercises: resolved.newExercises, days: resolved.days });
      successHaptic();
      useCelebrate.getState().celebrate(t('coach.schedulePlan.added'));
      markCoachPlanApplied(index);
    };
    if (resolved.overlapWeekdays.length === 0) {
      commit();
      return;
    }
    const days = resolved.overlapWeekdays.map((wd) => weekdayLabel(wd, locale)).join(' · ');
    Alert.alert(t('coach.schedulePlan.overwriteTitle'), t('coach.schedulePlan.overwriteBody', { days }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('coach.schedulePlan.overwriteCta'), style: 'destructive', onPress: commit },
    ]);
  };

  const confirmNewConversation = () => {
    if (messages.length === 0) return;
    Alert.alert(t('coach.newConversation'), t('coach.newConversationConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('coach.newConversation'), style: 'destructive', onPress: resetCoachChat },
    ]);
  };

  // Reads an uploaded document (photo or PDF) into a reference summary the
  // coach keeps for future conversations — a "teach" action, not a reply.
  const attachDocument = async () => {
    if (attachStage === 'picking' || attachStage === 'reading') return;
    if (referenceDocs.length >= MAX_COACH_REFERENCE_DOCS) {
      Alert.alert(t('coach.attachLimitTitle'), t('coach.attachLimitBody', { count: MAX_COACH_REFERENCE_DOCS }));
      return;
    }
    setAttachStage('picking');
    const picked = await pickReportBase64().catch(() => null);
    if (!picked) {
      setAttachStage('idle');
      return;
    }
    if (picked.kind === 'unsupported') {
      setMessages([...messages, { role: 'assistant', content: t('coach.attachUnsupported'), at: nowIso() }]);
      setAttachStage('idle');
      return;
    }
    setAttachStage('reading');
    try {
      const payload = picked.kind === 'pdf' ? { pdf: picked.base64 } : { image: picked.base64, imageMediaType: picked.mimeType };
      const { summary } = await analyzeCoachAttachment(payload, language);
      useEntitlement.getState().spend('coach');
      addCoachReferenceDoc({ name: picked.name, summary: isMockMode ? t('coach.mockReply') : summary });
      setMessages([...messages, { role: 'assistant', content: t('coach.attachAdded', { name: picked.name }), at: nowIso() }]);
      setAttachStage('idle');
    } catch (err) {
      if (err instanceof QuotaError || err instanceof FeatureLockedError) {
        useEntitlement.getState().refresh();
        setAttachStage('idle');
        router.push(`/upgrade?reason=${err instanceof QuotaError ? 'quota' : 'coach'}`);
        return;
      }
      const action = aiFailureAction(err, { titleKey: 'coach.attachErrorInvalidFile', bodyKey: 'coach.attachErrorFailed' });
      const message = action.kind === 'alert' ? t(action.bodyKey, action.values ?? {}) : t('coach.attachErrorFailed');
      setMessages([...messages, { role: 'assistant', content: message, at: nowIso() }]);
      setAttachStage('idle');
    } finally {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  const allowance =
    !coachUnlocked
      ? t('coach.lockedTitle')
      : coachLeft !== null
        ? t('coach.allowanceLeft', { left: coachLeft, cap: coachCap })
        : t('coach.usesAllowance');
  const canSend = !!input.trim() && !busy;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
      <BrandHeader title={t('common.appName')} right={<HeaderPill icon="sparkles" label={t('tabs.ai')} />} />
      <View style={styles.subHeader}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={styles.back}
        >
          <Ionicons name="chevron-back" size={24} color={theme.primary} />
          <Text style={{ color: theme.primary, fontSize: 15, fontWeight: '600' }}>{t('common.back')}</Text>
        </Pressable>
        <View style={styles.subTitle} pointerEvents="none">
          <Text style={[Type.section, { color: theme.text, fontSize: 20 }]} accessibilityRole="header">
            {t('tabs.ai')}
          </Text>
          <Text style={{ color: theme.textSecondary, fontSize: 13 }} numberOfLines={1}>
            {allowance}
          </Text>
        </View>
        <Pressable
          onPress={confirmNewConversation}
          hitSlop={8}
          disabled={messages.length === 0}
          accessibilityRole="button"
          accessibilityLabel={t('coach.newConversation')}
          style={styles.newChat}
        >
          <Ionicons name="create-outline" size={22} color={messages.length === 0 ? theme.textTertiary : theme.textSecondary} />
        </Pressable>
      </View>
      <View style={{ paddingHorizontal: Spacing.page }}>
        <Segmented<CoachFocus>
          options={FOCUS.map((f) => ({ key: f, label: t(`coach.focus.${f}`), icon: FOCUS_ICON[f] }))}
          value={focus}
          onChange={setFocus}
        />
      </View>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: Spacing.page, gap: Spacing.sm }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ marginBottom: Spacing.xs }}>
          <Text style={[Type.section, { color: theme.text, fontSize: 19 }]}>{t(`coach.focusTitle.${focus}`)}</Text>
          <Text style={{ color: theme.textSecondary, fontSize: 15, lineHeight: 21, marginTop: 2 }}>{t(`coach.focusBody.${focus}`)}</Text>
        </View>
        {!coachUnlocked && (
          <Pressable onPress={() => router.push('/upgrade?reason=coach')} style={[styles.lockCard, { backgroundColor: theme.card, borderColor: theme.primary }]}>
            <Ionicons name="lock-closed" size={22} color={theme.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: 15 }}>{t('coach.lockedTitle')}</Text>
              <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{t('coach.lockedBody')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textTertiary} />
          </Pressable>
        )}
        {messages.map((m, i) => (
          <View key={i} style={{ gap: 4 }}>
            <Bubble role={m.role} text={m.content} at={m.at} locale={locale} avatarLabel={t('tabs.ai')} />
            {m.schedulePlan && (
              <View style={[styles.draftWrap, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
                <View style={styles.draftHead}>
                  <IconTile icon="barbell-outline" size={64} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>{t('coach.programDraft')}</Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 18 }} numberOfLines={3}>
                      {m.schedulePlan.summary || t('coach.programDraftBody', { count: m.schedulePlan.days.length })}
                    </Text>
                  </View>
                </View>
                <ActionButton
                  label={appliedPlans.includes(i) ? t('coach.schedulePlan.added') : openDrafts.includes(i) ? t('coach.hideDraft') : t('coach.reviewProgramDraft')}
                  onPress={() => setOpenDrafts((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i]))}
                  variant={appliedPlans.includes(i) ? 'secondary' : 'primary'}
                  style={{ marginTop: Spacing.sm }}
                />
                {openDrafts.includes(i) && (
                  <SchedulePlanCard plan={m.schedulePlan} locale={locale} added={appliedPlans.includes(i)} onAdd={() => applySchedulePlan(m.schedulePlan!, i)} style={{ marginTop: Spacing.sm }} />
                )}
              </View>
            )}
          </View>
        ))}
        {(busy || attachStage === 'picking' || attachStage === 'reading') && (
          <View style={[styles.bubble, styles.assistant, { backgroundColor: theme.card }]}>
            {attachStage === 'reading' ? <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{t('coach.attachReading')}</Text> : <ActivityIndicator color={theme.primary} />}
          </View>
        )}
      </ScrollView>

      <View style={{ paddingHorizontal: Spacing.page, paddingBottom: insets.bottom + Spacing.sm, backgroundColor: theme.background }}>
        <View style={[styles.inputBar, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {documentPickerAvailable && (
            <Pressable
              onPress={attachDocument}
              disabled={attachStage === 'picking' || attachStage === 'reading'}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('coach.attach')}
              style={styles.attachBtn}
            >
              <Ionicons name="attach" size={22} color={theme.textSecondary} />
            </Pressable>
          )}
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={t('coach.askPlaceholder')}
            placeholderTextColor={theme.textTertiary}
            accessibilityLabel={t('coach.askPlaceholder')}
            style={[styles.input, { color: theme.text }]}
            multiline
            maxLength={1000}
          />
          <Pressable
            onPress={() => send()}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel={t('coach.send')}
            style={({ pressed }) => [styles.sendBtn, { backgroundColor: theme.primary, opacity: canSend ? 1 : 0.4 }, pressed && { transform: [{ scale: 0.92 }] }]}
          >
            <Ionicons name="paper-plane" size={18} color={theme.onPrimary} />
          </Pressable>
        </View>
        <Text style={{ color: theme.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 6, marginBottom: Spacing.sm }}>{t('coach.draftsNote')}</Text>
        <RowGroup style={{ marginBottom: 0 }}>
          <SettingsRow icon="settings-outline" title={t('coach.manageContext')} onPress={() => router.push('/coach-memory')} last />
        </RowGroup>
      </View>
    </KeyboardAvoidingView>
  );
}

/**
 * Which way a single message should read, from its own text rather than the
 * app's language setting: the coach answers in whichever language it was
 * spoken to, so one conversation can hold both.
 */
function directionOf(text: string): 'rtl' | 'ltr' {
  const arabic = (text.match(/[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return arabic > latin ? 'rtl' : 'ltr';
}

function Bubble({ role, text, at, locale, avatarLabel }: { role: 'user' | 'assistant'; text: string; at?: string; locale: string; avatarLabel: string }) {
  const theme = useTheme();
  const isUser = role === 'user';
  const rtl = directionOf(text) === 'rtl';
  const time = at ? new Date(at).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' }) : null;
  return (
    <View style={{ alignItems: isUser ? 'flex-end' : 'flex-start' }}>
      <View style={[styles.line, !isUser && { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-end' }]}>
        {!isUser && <Image source={require('../../assets/images/logo-tile.png')} style={styles.avatar} contentFit="contain" accessibilityLabel={avatarLabel} />}
        <View
          style={[
            styles.bubble,
            isUser ? [styles.user, { backgroundColor: theme.surfaceTint }] : [styles.assistant, { backgroundColor: theme.card }, cardShadow(theme.shadow)],
          ]}
        >
          <Text style={{ color: isUser ? theme.primaryDark : theme.text, fontSize: 16, lineHeight: 22, textAlign: rtl ? 'right' : 'left', writingDirection: rtl ? 'rtl' : 'ltr' }}>{text}</Text>
        </View>
      </View>
      {time && <Text style={{ color: theme.textTertiary, fontSize: 11, marginTop: 3, marginHorizontal: isUser ? 4 : 44 }}>{time}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  subHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.page, minHeight: TOUCH + 8, marginTop: Spacing.xs },
  back: { flexDirection: 'row', alignItems: 'center', minHeight: TOUCH, minWidth: TOUCH, zIndex: 1 },
  subTitle: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  newChat: { marginStart: 'auto', width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  lockCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1.5, borderRadius: Radius.control, padding: Spacing.md },
  line: { maxWidth: '88%' },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  bubble: { borderRadius: Radius.module, paddingHorizontal: Spacing.md, paddingVertical: 12, flexShrink: 1 },
  user: { borderBottomEndRadius: 6 },
  assistant: { borderBottomStartRadius: 6 },
  draftWrap: { marginStart: 40, borderRadius: Radius.module, padding: Spacing.ms },
  draftHead: { flexDirection: 'row', gap: Spacing.ms, alignItems: 'center' },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.xs, borderWidth: 1, borderRadius: Radius.module, paddingHorizontal: Spacing.sm, paddingVertical: 6 },
  input: { flex: 1, paddingHorizontal: Spacing.sm, paddingVertical: 10, fontSize: 16, maxHeight: 110 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  attachBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
