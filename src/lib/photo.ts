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
  return encodeJpeg(uri, 1024, 0.7);
}

/**
 * Same idea for a printed report (InBody sheet, a screenshot of a results
 * app): wider and sharper than a meal photo, because the numbers on a
 * results printout are small and a 1024px downscale blurs them into
 * guesses. Still re-encoded to JPEG — the file picker hands back whatever
 * the file was (HEIC from an iPhone, a 12 MB PNG screenshot), and the AI
 * API rejects unsupported formats and anything over 5 MB outright.
 */
export async function prepareReportImage(uri: string): Promise<{ uri: string; base64: string }> {
  return encodeJpeg(uri, 1600, 0.85);
}

async function encodeJpeg(uri: string, width: number, compress: number): Promise<{ uri: string; base64: string }> {
  const context = ImageManipulator.manipulate(uri);
  context.resize({ width });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    base64: true,
    compress,
    format: SaveFormat.JPEG,
  });
  return { uri: saved.uri, base64: saved.base64 ?? '' };
}
