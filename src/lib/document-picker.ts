import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * expo-document-picker only exists in a build that bundled it — detected
 * WITHOUT importing the package (same reasoning as photo.ts's image picker
 * check) so JS delivered over-the-air still runs on an older binary that
 * predates this native module.
 */
export const documentPickerAvailable = requireOptionalNativeModule('ExpoDocumentPicker') != null;

/**
 * Open the system file picker for a single PDF and return it as base64, or
 * null if the user backed out. Reading the file (expo-file-system) is
 * wrapped in the same try/catch the caller already has around this, since
 * that module's own availability isn't checked here.
 */
export async function pickPdfBase64(): Promise<{ name: string; base64: string } | null> {
  if (!documentPickerAvailable) return null;
  const DocumentPicker = await import('expo-document-picker');
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: true,
  });
  const asset = result.canceled ? undefined : result.assets?.[0];
  if (!asset) return null;
  const FileSystem = await import('expo-file-system/legacy');
  const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' });
  return { name: asset.name, base64 };
}
