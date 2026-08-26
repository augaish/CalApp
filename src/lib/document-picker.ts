import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * expo-document-picker only exists in a build that bundled it — detected
 * WITHOUT importing the package (same reasoning as photo.ts's image picker
 * check) so JS delivered over-the-air still runs on an older binary that
 * predates this native module.
 */
export const documentPickerAvailable = requireOptionalNativeModule('ExpoDocumentPicker') != null;

/**
 * Open the system file picker for a single report — a PDF export, or a
 * photo/screenshot saved as an image file (InBody and similar machines
 * export either, and image files often live in Files/iCloud Drive rather
 * than the Photos library the existing gallery picker searches). Reading
 * the file (expo-file-system) is wrapped in the same try/catch the caller
 * already has around this, since that module's own availability isn't
 * checked here.
 */
/** Claude's vision API only accepts these image formats — unlike the camera/
 * gallery path (always re-encoded to JPEG by photo.ts), a file picked here
 * keeps whatever format it was saved in. */
const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

export async function pickReportBase64(): Promise<
  | { name: string; base64: string; kind: 'pdf' }
  | { name: string; base64: string; kind: 'image'; mimeType: string }
  | { name: string; kind: 'unsupported'; mimeType: string }
  | null
> {
  if (!documentPickerAvailable) return null;
  const DocumentPicker = await import('expo-document-picker');
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/*'],
    copyToCacheDirectory: true,
  });
  const asset = result.canceled ? undefined : result.assets?.[0];
  if (!asset) return null;
  if (asset.mimeType === 'application/pdf') {
    const FileSystem = await import('expo-file-system/legacy');
    const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' });
    return { name: asset.name, base64, kind: 'pdf' };
  }
  const mimeType = asset.mimeType ?? '';
  if (!SUPPORTED_IMAGE_TYPES.has(mimeType)) {
    return { name: asset.name, kind: 'unsupported', mimeType };
  }
  const FileSystem = await import('expo-file-system/legacy');
  const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' });
  return { name: asset.name, base64, kind: 'image', mimeType };
}
