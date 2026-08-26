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
export async function pickReportBase64(): Promise<
  { name: string; base64: string; kind: 'pdf' | 'image' } | null
> {
  if (!documentPickerAvailable) return null;
  const DocumentPicker = await import('expo-document-picker');
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/*'],
    copyToCacheDirectory: true,
  });
  const asset = result.canceled ? undefined : result.assets?.[0];
  if (!asset) return null;
  const FileSystem = await import('expo-file-system/legacy');
  const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' });
  const kind = asset.mimeType === 'application/pdf' ? 'pdf' : 'image';
  return { name: asset.name, base64, kind };
}
