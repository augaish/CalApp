import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { PhotoProgress } from '@/components/photo-progress';
import { analyzeEquipment, analyzeMeal, FeatureLockedError, QuotaError } from '@/lib/api';
import { useEntitlement } from '@/lib/entitlement';
import { prepareImage } from '@/lib/photo';
import { usePending } from '@/lib/pending';
import { useAppStore } from '@/lib/store';

/**
 * Analyses a photo the user already had, with no camera in sight.
 *
 * "Upload a photo" used to route through the camera screen and open the picker
 * from there, which meant a viewfinder flash and a camera-permission prompt for
 * a flow that needs neither. The picker now runs where it was tapped and hands
 * the chosen image here.
 */
export default function PhotoAnalyze() {
  const { t } = useTranslation();
  const router = useRouter();
  const { uri, mode } = useLocalSearchParams<{ uri?: string; mode?: string }>();
  const isGym = mode === 'gym';
  const language = useAppStore((s) => s.language) ?? 'en';
  const setMeal = usePending((s) => s.setMeal);
  const setEquipment = usePending((s) => s.setEquipment);

  // Analysis spends an AI action, so it must not fire twice for one photo.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Nothing to analyse — bail out here rather than navigating during render.
    if (!uri) {
      router.back();
      return;
    }
    let alive = true;

    (async () => {
      try {
        const { uri: small, base64 } = await prepareImage(uri);
        if (!alive) return;
        if (isGym) {
          const analysis = await analyzeEquipment(base64, language);
          useEntitlement.getState().spend();
          if (!alive) return;
          setEquipment(analysis, small);
          router.replace('/gym-result');
        } else {
          const analysis = await analyzeMeal(base64, language);
          useEntitlement.getState().spend();
          if (!alive) return;
          setMeal(analysis, small);
          router.replace('/meal-result');
        }
      } catch (err) {
        if (!alive) return;
        if (err instanceof QuotaError || err instanceof FeatureLockedError) {
          useEntitlement.getState().refresh();
          router.replace(
            err instanceof QuotaError ? '/upgrade?reason=quota' : '/upgrade?reason=equipment',
          );
          return;
        }
        Alert.alert(t('common.error'));
        router.back();
      }
    })();

    return () => {
      alive = false;
    };
    // Deliberately keyed on the photo alone — nothing else should restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  if (!uri) return null;

  return (
    <PhotoProgress
      uri={uri}
      label={isGym ? t('scan.analyzingGym') : t('scan.analyzingMeal')}
    />
  );
}
