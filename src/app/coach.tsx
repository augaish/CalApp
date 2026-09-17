import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
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
import { illustrationFor, PhotoFallback } from '@/components/photo-fallback';
import { ActionButton, Chip, IconTile, Segmented, StatusPill } from '@/components/system';
import { Radius, Spacing, TOUCH, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { analyzeCoachAttachment, coachChat, FeatureLockedError, isMockMode, QuotaError } from '@/lib/api';
import { aiFailureAction } from '@/lib/api-errors';
import { applyCoachAction } from '@/lib/coach-actions';
import { resolveCoachSchedule } from '@/lib/coach-schedule';
import { buildCoachContext } from '@/lib/coach-context';
import { useCelebrate } from '@/lib/celebrate';
import { documentPickerAvailable, pickReportBase64 } from '@/lib/document-picker';
import { successHaptic } from '@/lib/feedback';
import { useEntitlement } from '@/lib/entitlement';
import { perServing } from '@/lib/recipes';
import { MAX_COACH_REFERENCE_DOCS, useAppStore } from '@/lib/store';
import type { ChatMessage, CoachAction, CoachFocus, CoachSchedulePlan } from '@/lib/types';
import { formatWeight } from '@/lib/units';

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
  const remaining = useEntitlement((s) => s.remaining);
  const limit = useEntitlement((s) => s.limit);
  const entLoaded = useEntitlement((s) => s.loaded);
  const savedRecipes = useAppStore((s) => s.recipes);

  const messages = useAppStore((s) => s.coachMessages);
  const setMessages = useAppStore((s) => s.setCoachMessages);
  const resetCoachChat = useAppStore((s) => s.resetCoachChat);
  const appliedPlans = useAppStore((s) => s.coachAppliedPlans);
  const markCoachPlanApplied = useAppStore((s) => s.markCoachPlanApplied);
  const referenceDocs = useAppStore((s) => s.coachReferenceDocs);
  const addCoachReferenceDoc = useAppStore((s) => s.addCoachReferenceDoc);
  const units = useAppStore((s) => s.units);
  const [focus, setFocus] = useState<CoachFocus>(FOCUS.includes(focusParam as CoachFocus) ? (focusParam as CoachFocus) : 'food');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [attachStage, setAttachStage] = useState<'idle' | 'picking' | 'reading'>('idle');
  const [openDrafts, setOpenDrafts] = useState<number[]>([]);
  // The focus chips step aside while the keyboard is up: the reply is what
  // needs the room then, not the filter.
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  // Undo closures for actions applied in this visit, keyed message-action;
  // in state (not a ref) because whether a card offers Undo is rendered.
  const [undos, setUndos] = useState<Record<string, () => void>>({});

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

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
      const { reply, schedulePlan, recipeDraft, actions, suggestions } = await coachChat(next, language, await buildCoachContext(language, 7, focus));
      useEntitlement.getState().spend('coach');
      // A recipe the coach wrote is saved exactly once, as a draft to review;
      // nothing is planned or logged until the person does it (S18).
      const recipeId = recipeDraft ? useAppStore.getState().addRecipe({ ...recipeDraft, language, source: 'ai', reviewStatus: 'needs_review' }) : undefined;
      const text = isMockMode ? t('coach.mockReply') : reply || (schedulePlan ? t('coach.schedulePlan.fallbackIntro') : recipeDraft ? t('coach.recipeDraftIntro') : reply);
      setMessages([
        ...next,
        {
          role: 'assistant',
          content: text,
          schedulePlan,
          at: nowIso(),
          ...(recipeId ? { recipeId } : {}),
          // Proposals and follow-ups travel with the reply; nothing is applied here.
          ...(actions && actions.length ? { actions } : {}),
          ...(suggestions && suggestions.length ? { suggestions } : {}),
        },
      ]);
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

  /**
   * A proposal card's tap. The change goes through the same store actions a
   * screen would use; the card then reads Applied and offers Undo for as
   * long as this screen is open.
   */
  const applyAction = (mi: number, ai: number) => {
    const current = useAppStore.getState().coachMessages;
    const action = current[mi]?.actions?.[ai];
    if (!action || action.applied) return;
    const result = applyCoachAction(action);
    if (!result.ok) {
      Alert.alert(t(`coach.actions.${result.reason}`));
      return;
    }
    const undo = result.undo;
    if (undo) setUndos((u) => ({ ...u, [`${mi}-${ai}`]: undo }));
    successHaptic();
    useCelebrate.getState().celebrate(t('coach.actions.applied'));
    setMessages(current.map((m, i) => (i === mi ? { ...m, actions: m.actions!.map((a, j) => (j === ai ? { ...a, applied: true } : a)) } : m)));
  };
  const undoAction = (mi: number, ai: number) => {
    const undo = undos[`${mi}-${ai}`];
    if (!undo) return;
    undo();
    setUndos((u) => {
      const next = { ...u };
      delete next[`${mi}-${ai}`];
      return next;
    });
    const current = useAppStore.getState().coachMessages;
    setMessages(current.map((m, i) => (i === mi ? { ...m, actions: m.actions!.map((a, j) => (j === ai ? { ...a, applied: false } : a)) } : m)));
  };

  /** What a proposal card says: an icon, a title, the figures, and the tap's label. */
  const actionCopy = (a: CoachAction): { icon: keyof typeof Ionicons.glyphMap; title: string; detail: string; cta: string } => {
    const kcal = t('common.kcal');
    const g = t('common.grams');
    switch (a.kind) {
      case 'logFood': {
        const first = a.items[0];
        const more = a.items.length > 1 ? ` ${t('coach.actions.moreItems', { count: a.items.length - 1 })}` : '';
        const sum = a.items.reduce((acc, i) => ({ c: acc.c + i.calories, p: acc.p + i.proteinG, cb: acc.cb + i.carbsG, f: acc.f + i.fatG }), { c: 0, p: 0, cb: 0, f: 0 });
        return {
          icon: 'restaurant',
          title: t('coach.actions.logFoodTitle', { name: `${first.name}${more}`, meal: t(`home.mealTypes.${a.mealType}`) }),
          detail: `${first.portion ? `${first.portion} · ` : ''}${t('recipe.portionMacros', { kcal: Math.round(sum.c), protein: Math.round(sum.p), carbs: Math.round(sum.cb), fat: Math.round(sum.f) })}`,
          cta: t('coach.actions.logFood'),
        };
      }
      case 'updateFood': {
        const meal = useAppStore.getState().meals.find((m) => m.id === a.mealId);
        const item = meal?.items[a.itemIndex];
        const parts: string[] = [];
        if (a.patch.calories != null) parts.push(`${a.patch.calories} ${kcal}`);
        if (a.patch.proteinG != null) parts.push(`${a.patch.proteinG}${g} ${t('home.protein').toLowerCase()}`);
        if (a.patch.carbsG != null) parts.push(`${a.patch.carbsG}${g} ${t('home.carbs').toLowerCase()}`);
        if (a.patch.fatG != null) parts.push(`${a.patch.fatG}${g} ${t('home.fat').toLowerCase()}`);
        if (a.patch.portion) parts.push(a.patch.portion);
        return {
          icon: 'create-outline',
          title: t('coach.actions.updateFoodTitle', { name: a.patch.name ?? item?.name ?? '' }),
          detail: parts.join(' · '),
          cta: t('coach.actions.updateFood'),
        };
      }
      case 'logWorkout':
        return {
          icon: 'barbell',
          title: t('coach.actions.workoutTitle', { name: a.exerciseName, count: a.sets.length }),
          detail: a.sets
            .map((s) => [s.weightKg != null ? formatWeight(s.weightKg, units, t, 1) : null, s.reps != null ? `× ${s.reps}` : null, s.seconds != null ? `${s.seconds}s` : null].filter(Boolean).join(' '))
            .join(' · '),
          cta: t('coach.actions.logWorkout'),
        };
      case 'setTargets': {
        const parts: string[] = [];
        if (a.targets.calories != null) parts.push(`${a.targets.calories} ${kcal}`);
        if (a.targets.proteinG != null) parts.push(`${a.targets.proteinG}${g} ${t('home.protein').toLowerCase()}`);
        if (a.targets.carbsG != null) parts.push(`${a.targets.carbsG}${g} ${t('home.carbs').toLowerCase()}`);
        if (a.targets.fatG != null) parts.push(`${a.targets.fatG}${g} ${t('home.fat').toLowerCase()}`);
        return { icon: 'flag-outline', title: t('coach.actions.targetsTitle'), detail: parts.join(' · '), cta: t('coach.actions.setTargets') };
      }
      case 'logWater':
        return { icon: 'water', title: t('coach.actions.waterTitle', { ml: a.ml }), detail: '', cta: t('coach.actions.logWater') };
      case 'logWeight':
        return { icon: 'scale-outline', title: t('coach.actions.weightTitle', { kg: formatWeight(a.kg, units, t) }), detail: a.date ?? '', cta: t('coach.actions.logWeight') };
    }
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

  // The allowance line is the live figure, a loading state, or an honest
  // "unavailable"; it never pretends to know.
  const allowance =
    !coachUnlocked
      ? t('coach.lockedTitle')
      : coachLeft !== null
        ? t('coach.allowanceLeft', { left: coachLeft, cap: coachCap })
        : typeof remaining === 'number' && typeof limit === 'number'
          ? t('upgrade.remaining', { remaining, limit })
          : !entLoaded
            ? t('coach.allowanceLoading')
            : t('coach.allowanceUnavailable');
  const canSend = !!input.trim() && !busy;
  const last = messages[messages.length - 1];
  const chips = last?.role === 'assistant' && !busy ? (last.suggestions ?? []) : [];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
      {/* One thin brand strip carries everything the two old rows did: the
          brand, Back, the screen name with its allowance, shared context and
          a new conversation — so the thread gets the height back. */}
      <LinearGradient colors={[theme.gradientStart, theme.gradientEnd]} start={{ x: 0, y: 0.4 }} end={{ x: 1, y: 0.6 }} style={[styles.strip, { paddingTop: insets.top + Spacing.xs }]}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={styles.stripBtn}
        >
          <Ionicons name="chevron-back" size={24} color={theme.onGradient} />
        </Pressable>
        <Image source={require('../../assets/images/logo-tile.png')} style={styles.stripLogo} contentFit="contain" accessibilityLabel="Calgym" />
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.onGradient, fontSize: 17, fontWeight: '800' }} accessibilityRole="header" numberOfLines={1}>
            {t('tabs.ai')}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.88)', fontSize: 12 }} numberOfLines={1}>
            {allowance}
          </Text>
        </View>
        <Pressable onPress={() => router.push('/coach-memory')} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('coach.manageContext')} style={styles.stripBtn}>
          <Ionicons name="options-outline" size={22} color={theme.onGradient} />
        </Pressable>
        <Pressable
          onPress={confirmNewConversation}
          hitSlop={8}
          disabled={messages.length === 0}
          accessibilityRole="button"
          accessibilityLabel={t('coach.newConversation')}
          style={[styles.stripBtn, messages.length === 0 && { opacity: 0.45 }]}
        >
          <Ionicons name="create-outline" size={22} color={theme.onGradient} />
        </Pressable>
      </LinearGradient>
      {!keyboardOpen && (
        <View style={{ paddingHorizontal: Spacing.page, paddingTop: Spacing.sm }}>
          <Segmented<CoachFocus>
            options={FOCUS.map((f) => ({ key: f, label: t(`coach.focus.${f}`), icon: FOCUS_ICON[f] }))}
            value={focus}
            onChange={setFocus}
          />
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: Spacing.page, gap: Spacing.sm }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
      >
        {messages.length === 0 && (
          <View style={{ marginBottom: Spacing.xs }}>
            <Text style={[Type.section, { color: theme.text, fontSize: 19 }]}>{t(`coach.focusTitle.${focus}`)}</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 15, lineHeight: 21, marginTop: 2 }}>{t(`coach.focusBody.${focus}`)}</Text>
            <Text style={{ color: theme.textTertiary, fontSize: 13, lineHeight: 19, marginTop: Spacing.sm }}>{t('coach.canAct')}</Text>
          </View>
        )}
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
            {m.recipeId &&
              (() => {
                const r = savedRecipes.find((x) => x.id === m.recipeId);
                return (
                  <View style={[styles.draftWrap, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
                    {r ? (
                      <>
                        <View style={styles.draftHead}>
                          <PhotoFallback uri={r.photoUri} illustration={illustrationFor(r.name)} size={64} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: theme.text, fontWeight: '800', fontSize: 16 }}>{r.name}</Text>
                            <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 18 }} numberOfLines={3}>
                              {r.description || t('coach.recipeDraftBody', { kcal: Math.round(perServing(r).calories), servings: r.servings })}
                            </Text>
                            <View style={{ alignSelf: 'flex-start', marginTop: 4 }}>
                              <StatusPill label={r.reviewStatus === 'ready' ? t('coach.recipeReady') : t('coach.recipeDraft')} tone={r.reviewStatus === 'ready' ? 'logged' : 'review'} />
                            </View>
                          </View>
                        </View>
                        <ActionButton label={t('coach.reviewRecipeDraft')} icon="document-text-outline" onPress={() => router.push(`/recipe?id=${encodeURIComponent(r.id)}`)} style={{ marginTop: Spacing.sm }} />
                      </>
                    ) : (
                      <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{t('coach.draftRemoved')}</Text>
                    )}
                  </View>
                );
              })()}
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
            {/* Proposed changes: one card each, written only by the tap. */}
            {m.actions?.map((a, j) => {
              const copy = actionCopy(a);
              const canUndo = !!undos[`${i}-${j}`];
              return (
                <View key={`${i}-${j}`} style={[styles.draftWrap, { backgroundColor: theme.card }, cardShadow(theme.shadow)]}>
                  <View style={styles.draftHead}>
                    <IconTile icon={copy.icon} size={44} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: theme.text, fontWeight: '800', fontSize: 15 }}>{copy.title}</Text>
                      {!!copy.detail && (
                        <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 18 }} numberOfLines={3}>
                          {copy.detail}
                        </Text>
                      )}
                      {!!a.note && (
                        <Text style={{ color: theme.textTertiary, fontSize: 12, lineHeight: 17, marginTop: 2 }} numberOfLines={3}>
                          {a.note}
                        </Text>
                      )}
                    </View>
                  </View>
                  {a.applied ? (
                    <View style={[styles.actionRow, { marginTop: Spacing.sm }]}>
                      <StatusPill label={t('coach.actions.applied')} tone="logged" icon="checkmark" />
                      {canUndo && <ActionButton label={t('coach.actions.undo')} icon="arrow-undo" variant="secondary" onPress={() => undoAction(i, j)} />}
                    </View>
                  ) : (
                    <>
                      <ActionButton label={copy.cta} icon="checkmark" onPress={() => applyAction(i, j)} style={{ marginTop: Spacing.sm }} />
                      <Text style={{ color: theme.textTertiary, fontSize: 11, marginTop: 6, textAlign: 'center' }}>{t('coach.actions.proposedBy')}</Text>
                    </>
                  )}
                </View>
              );
            })}
          </View>
        ))}
        {(busy || attachStage === 'picking' || attachStage === 'reading') && (
          <View style={[styles.bubble, styles.assistant, { backgroundColor: theme.card }]}>
            {attachStage === 'reading' ? <Text style={{ color: theme.textSecondary, fontSize: 13 }}>{t('coach.attachReading')}</Text> : <ActivityIndicator color={theme.primary} />}
          </View>
        )}
      </ScrollView>

      <View style={{ paddingBottom: insets.bottom + Spacing.sm, backgroundColor: theme.background }}>
        {/* Follow-ups the coach offered: one tap sends them as the next message. */}
        {chips.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.chipRow}
            accessibilityLabel={t('coach.suggestions')}
          >
            {chips.map((c) => (
              <Chip key={c} label={c} selected={false} onPress={() => send(c)} />
            ))}
          </ScrollView>
        )}
        <View style={[styles.inputBar, { backgroundColor: theme.card, borderColor: theme.border, marginHorizontal: Spacing.page }]}>
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
  strip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.sm, paddingBottom: Spacing.sm, borderBottomLeftRadius: Radius.lg, borderBottomRightRadius: Radius.lg },
  stripBtn: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
  stripLogo: { width: 30, height: 30, borderRadius: 8 },
  chipRow: { flexDirection: 'row', gap: 6, paddingHorizontal: Spacing.page, paddingBottom: Spacing.sm },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
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
