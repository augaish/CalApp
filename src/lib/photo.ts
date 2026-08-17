import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * Picking from the photo library needs the expo-image-picker native module,
 * which only exists in a build that bundled it. Detect it WITHOUT importing the
 * package — its module throws at import time when the native side is missing —
 * so JS delivered over-the-air still runs on an older binary.
 */
export const photoPickerAvailable = requireOptionalNativeModule('ExponentImagePicker') != null;

/**
 * Open the photo library and return the chosen image, or null if the user
 * backed out. Throws only when the picker itself fails.
 */
export async function pickPhoto(): Promise<string | null> {
  if (!photoPickerAvailable) return null;
  const ImagePicker = await import('expo-image-picker');
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
  });
  if (result.canceled) return null;
  return result.assets?.[0]?.uri ?? null;
}

/**
 * Downscale to something an AI call can carry. 1024px wide at 70% JPEG keeps
 * plates legible while staying well under the server's upload cap.
 */
export async function prepareImage(uri: string): Promise<{ uri: string; base64: string }> {
  const context = ImageManipulator.manipulate(uri);
  context.resize({ width: 1024 });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    base64: true,
    compress: 0.7,
    format: SaveFormat.JPEG,
  });
  return { uri: saved.uri, base64: saved.base64 ?? '' };
}
