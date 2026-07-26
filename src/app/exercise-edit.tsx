import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Field, Screen, Title } from '@/components/ui';
import { Radius, Spacing, Type, cardShadow } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { analyzeExercise, fetchVideoTitle } from '@/lib/api';
import { findExercise, MUSCLE_GROUPS } from '@/lib/exercises';
import { successHaptic } from '@/lib/feedback';
import { usePending } from '@/lib/pending';
import { useAppStore } from '@/lib/store';
import type { ExerciseType, MuscleGroup } from '@/lib/types';

const TYPES: ExerciseType[] = ['weight_reps', 'bodyweight_reps', 'time', 'distance_time'];
const isUrl = (s: string) => /^https?:\/\/\S+$/.test(s.trim());

export default function ExerciseEdit() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();

  const custom = useAppStore((s) => s.exercises);
  const language = useAppStore((s) => s.language) ?? 'en';
  const addExercise = useAppStore((s) => s.addExercise);
  const updateExercise = useAppStore((s) => s.updateExercise);
  const removeExercise = useAppStore((s) => s.removeExercise);
  const capturedPhoto = usePending((s) => s.capturedPhoto);
  const setCapturedPhoto = usePending((s) => s.setCapturedPhoto);
  const [aiBusy, setAiBusy] = useState(false);

  const existing = id ? findExercise(id, custom) : undefined;
  const editable = !existing || existing.source !== 'builtin';

  const [name, setName] = useState(existing?.name ?? '');
  const [category, setCategory] = useState<MuscleGroup>(existing?.category ?? 'chest');
  const [type, setType] = useState<ExerciseType>(existing?.type ?? 'weight_reps');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [video, setVideo] = useState(existing?.videoUrl ?? '');

  // Only a photo captured *after* this screen opened is ours — snapshot the
  // mount value so a stale hand-off from an earlier flow can't leak in.
  const [capturedAtMount] = useState(capturedPhoto);
  const freshCapture = capturedPhoto !== capturedAtMount ? capturedPhoto : null;
  const photo = freshCapture ?? existing?.photoUri;

  const save = () => {
    if (name.trim().length < 2) {
      Alert.alert(t('exerciseEdit.nameRequired'));
      return;
    }
    const patch = {
      name: name.trim(),
      category,
      type,
      description: description.trim() || undefined,
      videoUrl: video.trim() || undefined,
      photoUri: photo,
    };
    successHaptic();
    setCapturedPhoto(null);
    if (existing) {
      updateExercise(existing.id, patch);
      router.back();
    } else {
      const newId = addExercise(patch);
      router.replace(`/exercise-detail?id=${encodeURIComponent(newId)}`);
    }
  };

  const autofill = async () => {
    if (aiBusy) return;
    setAiBusy(true);
    try {
      let seed = name.trim();
      // No name yet but a video link is present → use its title as the seed.
      if (seed.length < 2 && isUrl(video)) {
        const title = await fetchVideoTitle(video.trim());
        if (title) {
          seed = title;
          setName(title);
        }
      }
      if (seed.length < 2) {
        Alert.alert(t('exerciseEdit.autofillNeedsName'));
        return;
      }
      const info = await analyzeExercise(seed, language);
      if ((MUSCLE_GROUPS as string[]).includes(info.category)) setCategory(info.category as MuscleGroup);
      if ((TYPES as string[]).includes(info.type)) setType(info.type as ExerciseType);
      if (info.description?.trim()) setDescription(info.description.trim());
      successHaptic();
    } catch {
      Alert.alert(t('common.error'));
    } finally {
      setAiBusy(false);
    }
  };

  const del = () => {
    if (!existing) return;
    Alert.alert(t('exerciseEdit.editTitle'), t('exerciseEdit.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('exerciseEdit.delete'),
        style: 'destructive',
        onPress: () => {
          removeExercise(existing.id);
          router.dismissTo('/exercise-library');
        },
      },
    ]);
  };

  return (
    <Screen footer={<Button label={t('exerciseEdit.save')} icon="checkmark" onPress={save} disabled={!editable} />}>
      <Title>{existing ? t('exerciseEdit.editTitle') : t('exerciseEdit.addTitle')}</Title>

      {photo ? (
        <Pressable onPress={() => router.push('/scan?mode=photo')}>
          <Image source={{ uri: photo }} style={styles.photo} contentFit="cover" />
          <View style={[styles.photoEdit, { backgroundColor: theme.card }]}>
            <Ionicons name="camera" size={16} color={theme.primary} />
          </View>
        </Pressable>
      ) : (
        <Button
          label={t('exerciseEdit.addPhoto')}
          icon="camera"
          variant="secondary"
          onPress={() => router.push('/scan?mode=photo')}
          style={{ marginBottom: Spacing.md }}
        />
      )}

      <Field
        label={t('exerciseEdit.name')}
        value={name}
        onChangeText={setName}
        placeholder={t('exerciseEdit.namePlaceholder')}
        maxLength={60}
        editable={editable}
      />

      {editable && (
        <Button
          label={t('exerciseEdit.autofill')}
          icon="sparkles"
          variant="secondary"
          loading={aiBusy}
          onPress={autofill}
          style={{ marginBottom: Spacing.md }}
        />
      )}

      {/* Category */}
      <Text style={[Type.caption, { color: theme.textSecondary, marginBottom: 6 }]}>
        {t('exerciseEdit.category')}
      </Text>
      <View style={styles.chipWrap}>
        {MUSCLE_GROUPS.map((cat) => {
          const active = category === cat;
          return (
            <Pressable
              key={cat}
              onPress={() => editable && setCategory(cat)}
              style={[
                styles.chip,
                { backgroundColor: active ? theme.primary : theme.card, borderColor: active ? theme.primary : theme.border },
              ]}
            >
              <Text style={{ color: active ? theme.onPrimary : theme.textSecondary, fontWeight: '600', fontSize: 13 }}>
                {t(`muscles.${cat}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Type */}
      <Text style={[Type.caption, { color: theme.textSecondary, marginBottom: 6, marginTop: Spacing.md }]}>
        {t('exerciseEdit.type')}
      </Text>
      <View style={styles.chipWrap}>
        {TYPES.map((tp) => {
          const active = type === tp;
          return (
            <Pressable
              key={tp}
              onPress={() => editable && setType(tp)}
              style={[
                styles.chip,
                { backgroundColor: active ? theme.primary : theme.card, borderColor: active ? theme.primary : theme.border },
              ]}
            >
              <Text style={{ color: active ? theme.onPrimary : theme.textSecondary, fontWeight: '600', fontSize: 13 }}>
                {t(`exerciseEdit.types.${tp}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Description */}
      <Text style={[Type.caption, { color: theme.textSecondary, marginBottom: 6, marginTop: Spacing.md }]}>
        {t('exerciseEdit.description')}
      </Text>
      <View style={[styles.textAreaWrap, { backgroundColor: theme.card, borderColor: theme.border }, cardShadow(theme.shadow)]}>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder={t('exerciseEdit.descriptionPlaceholder')}
          placeholderTextColor={theme.textTertiary}
          multiline
          editable={editable}
          maxLength={600}
          style={[styles.textArea, { color: theme.text }]}
        />
      </View>

      <View style={{ marginTop: Spacing.md }}>
        <Field
          label={t('exerciseEdit.video')}
          value={video}
          onChangeText={setVideo}
          placeholder={t('exerciseEdit.videoPlaceholder')}
          autoCapitalize="none"
          keyboardType="url"
          editable={editable}
        />
        {isUrl(video) && (
          <Pressable onPress={() => Linking.openURL(video.trim())} style={styles.watchRow}>
            <Ionicons name="logo-youtube" size={18} color={theme.danger} />
            <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: '600' }}>
              {t('gymResult.watchVideo')}
            </Text>
          </Pressable>
        )}
      </View>

      {existing && existing.source !== 'builtin' ? (
        <Button
          label={t('exerciseEdit.delete')}
          variant="ghost"
          icon="trash-outline"
          onPress={del}
          style={{ marginTop: Spacing.xs }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: { width: '100%', height: 170, borderRadius: Radius.lg, marginBottom: Spacing.md },
  photoEdit: {
    position: 'absolute',
    bottom: Spacing.md + 8,
    insetInlineEnd: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    borderWidth: 1.5,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  textAreaWrap: { borderWidth: 1, borderRadius: Radius.sm, padding: Spacing.md },
  textArea: { fontSize: 16, minHeight: 90, textAlignVertical: 'top', padding: 0 },
  watchRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -Spacing.sm, marginBottom: Spacing.sm },
});
