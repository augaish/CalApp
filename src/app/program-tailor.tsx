import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { PageHeader } from '@/components/brand-header';
import { ProgramBody } from '@/components/program-body';
import { Icon } from '@/components/icon';
import { Chip, InfoLine } from '@/components/system';
import { Screen } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { alertProblem } from '@/lib/alerts';
import { tailorProgram } from '@/lib/api';
import { aiFailureAction } from '@/lib/api-errors';
import { buildCoachContext } from '@/lib/coach-context';
import { useEntitlement } from '@/lib/entitlement';
import { successHaptic } from '@/lib/feedback';
import { includesFood, includesTraining } from '@/lib/plan-answers';
import { useAppStore } from '@/lib/store';
import type { TailorMessage } from '@/lib/types';


/**
 * Tailor a draft program by asking: "move leg day to Monday", "no fish".
 * Each change comes back with a "What changed" card, and the draft updates
 * in place — still a draft until Start. The first two changes are covered by
 * the build; after that each is one AI action, and the screen says so before
 * you send, not after.
 */
export default function ProgramTailor() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const locale = i18n.language === 'ar' ? 'ar' : 'en';
  const language = useAppStore((s) => s.language) ?? 'en';
  const draft = useAppStore((s) => s.programDraft);
  const setProgramDraft = useAppStore((s) => s.setProgramDraft);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [showDraft, setShowDraft] = useState(false);
  const scroller = useRef<ScrollView>(null);

  if (!draft) {
    return (
      <Screen header={<PageHeader title={t('program.tailorTitle')} />}>
        <Text style={{ color: theme.textSecondary }}>{t('program.noDraft')}</Text>
      </Screen>
    );
  }

  const answers = draft.answers;
  const suggestions = [
    ...(answers && includesTraining(answers) ? ['moveDay', 'shorter'] : []),
    ...(answers && includesFood(answers) ? ['noFish', 'breakfast'] : []),
    ...(!answers ? ['moveDay', 'noFish'] : []),
  ];
  const used = Math.max(0, (draft.program.freeChanges ?? 2) - draft.freeLeft);
  const counter =
    draft.freeLeft > 0
      ? t('program.freeCounter', { used, total: draft.program.freeChanges ?? 2 })
      : t('program.paidCounter');

  const send = async (raw?: string) => {
    const request = (raw ?? text).trim();
    if (request.length < 2 || busy) return;
    const current = useAppStore.getState().programDraft;
    if (!current) return;
    setBusy(true);
    setText('');
    const withMine: TailorMessage[] = [...current.chat, { role: 'user', text: request }];
    setProgramDraft({ ...current, chat: withMine });
    setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 50);
    try {
      const context = await buildCoachContext(language);
      const result = await tailorProgram({
        language,
        context,
        answers: current.answers,
        program: current.program,
        request,
        history: current.chat.map((m) => ({ role: m.role, text: m.text })),
        draftId: current.draftId,
      });
      const latest = useAppStore.getState().programDraft ?? current;
      setProgramDraft({
        ...latest,
        program: { ...result.program, draftId: current.program.draftId, freeChanges: current.program.freeChanges },
        answers: result.answers ?? latest.answers,
        freeLeft: result.freeLeft,
        chat: [...withMine, { role: 'assistant', text: result.reply, changes: result.changes, charged: result.charged }],
      });
      if (result.changes.length > 0) successHaptic();
      if (result.charged) void useEntitlement.getState().refresh();
      setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 80);
    } catch (err) {
      // Take the unanswered message back out, and give it back to the box.
      const latest = useAppStore.getState().programDraft;
      if (latest) setProgramDraft({ ...latest, chat: current.chat });
      setText(request);
      const action = aiFailureAction(err, { titleKey: 'program.unusableTitle', bodyKey: 'program.unusableBody' });
      if (action.kind === 'upgrade') {
        void useEntitlement.getState().refresh();
        router.push(`/membership?reason=${action.reason}`);
      } else if (action.kind !== 'none') {
        alertProblem(t(action.titleKey), t(action.bodyKey, action.values));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      scroll={false}
      header={<PageHeader title={t('program.tailorTitle')} subtitle={counter} backLabel={t('program.draft')} />}
      style={{ paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 }}
      footer={
        <View style={{ gap: Spacing.xs }}>
          {draft.chat.length === 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: Spacing.xs }}>
              {suggestions.map((k) => (
                <Chip key={k} label={t(`program.suggest.${k}`)} selected={false} onPress={() => setText(t(`program.suggest.${k}Text`))} />
              ))}
            </ScrollView>
          )}
          {draft.freeLeft === 0 && <InfoLine icon="flash-outline">{t('program.costNext')}</InfoLine>}
          <View style={[styles.inputRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={t('program.tailorPlaceholder')}
              placeholderTextColor={theme.textTertiary}
              multiline
              maxLength={500}
              editable={!busy}
              accessibilityLabel={t('program.tailorPlaceholder')}
              style={{ flex: 1, color: theme.text, fontSize: 16, maxHeight: 110, paddingVertical: 8 }}
              onSubmitEditing={() => send()}
            />
            <Pressable
              onPress={() => send()}
              disabled={busy || text.trim().length < 2}
              accessibilityRole="button"
              accessibilityLabel={t('program.send')}
              style={[styles.send, { backgroundColor: busy || text.trim().length < 2 ? theme.cardSubtle : theme.primary }]}
            >
              <Icon name="arrow-up" size={20} color={busy || text.trim().length < 2 ? theme.textTertiary : theme.onPrimary} />
            </Pressable>
          </View>
        </View>
      }
    >
      <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={{ padding: Spacing.page, gap: Spacing.sm }} keyboardShouldPersistTaps="handled">
        <Bubble role="assistant" text={t('program.tailorHello')} />
        {draft.chat.map((m, i) => (
          <View key={i} style={{ gap: Spacing.xs }}>
            <Bubble role={m.role} text={m.text} />
            {m.role === 'assistant' && (m.changes?.length ?? 0) > 0 && (
              <View style={[styles.changes, { backgroundColor: theme.card, borderColor: theme.success }, cardShadow(theme.shadow)]}>
                <Text style={[Type.eyebrow, { color: theme.successText, marginBottom: 4 }]}>{t('program.whatChanged')}</Text>
                {m.changes!.map((c, j) => (
                  <View key={j} style={styles.changeRow}>
                    <Icon name="swap-horizontal" size={14} color={theme.successText} />
                    <Text style={{ color: theme.text, fontSize: 14, flex: 1, lineHeight: 19 }}>{c}</Text>
                  </View>
                ))}
                <Text style={{ color: theme.textTertiary, fontSize: 12, marginTop: 4 }}>
                  {m.charged ? t('program.usedAction') : t('program.usedFree')}
                </Text>
              </View>
            )}
          </View>
        ))}
        {busy && (
          <View style={[styles.bubble, styles.theirs, { backgroundColor: theme.card, flexDirection: 'row', gap: 8, alignItems: 'center' }]}>
            <ActivityIndicator size="small" color={theme.primary} />
            <Text style={{ color: theme.textSecondary }}>{t('program.updating')}</Text>
          </View>
        )}
        <Pressable onPress={() => setShowDraft((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: showDraft }} style={[styles.draftToggle, { borderColor: theme.border }]}>
          <Icon name={showDraft ? 'chevron-up' : 'document-text-outline'} size={16} color={theme.primary} />
          <Text style={{ color: theme.primary, fontWeight: '700' }}>{showDraft ? t('program.hideDraft') : t('program.showDraft')}</Text>
        </Pressable>
        {showDraft && <ProgramBody program={draft.program} scope={answers?.scope ?? 'both'} locale={locale} />}
      </ScrollView>

    </Screen>
  );
}

function Bubble({ role, text }: { role: 'user' | 'assistant'; text: string }) {
  const theme = useTheme();
  const mine = role === 'user';
  return (
    <View style={[styles.bubble, mine ? styles.mine : styles.theirs, { backgroundColor: mine ? theme.primary : theme.card }]}>
      <Text style={{ color: mine ? theme.onPrimary : theme.text, fontSize: 15, lineHeight: 21 }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '86%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  mine: { alignSelf: 'flex-end', borderBottomRightRadius: 6 },
  theirs: { alignSelf: 'flex-start', borderBottomLeftRadius: 6 },
  changes: { alignSelf: 'stretch', borderWidth: 1, borderRadius: Radius.md, padding: Spacing.ms, gap: 4 },
  changeRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  draftToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: Radius.md, minHeight: 44, marginTop: Spacing.sm },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderWidth: 1, borderRadius: 22, paddingStart: 14, paddingEnd: 5, paddingVertical: 4 },
  send: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
});
