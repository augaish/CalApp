import { requireOptionalNativeModule } from 'expo-modules-core';

import { prepareReportImage } from './photo';

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
  const mimeType = asset.mimeType ?? '';
  // Some providers (iCloud Drive, a few Android file managers) hand back no
  // mimeType at all, so the extension is the only thing left to go on.
  const isPdf = mimeType === 'application/pdf' || /\.pdf$/i.test(asset.name ?? '');
  if (isPdf) {
    const FileSystem = await import('expo-file-system/legacy');
    const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' });
    return { name: asset.name, base64, kind: 'pdf' };
  }
  // Everything else the picker can return here is an image (it was opened
  // filtered to PDFs and images). This used to read the file's raw bytes and
  // send them as-is, which is why this path failed while the camera path
  // worked: a photo straight off a phone is 3-8 MB and, on iPhone, usually
  // HEIC — the vision API caps an image at 5 MB and does not accept HEIC at
  // all. Re-encoding through the same pipeline the camera uses fixes both,
  // and makes an unknown mimeType a non-issue.
  try {
    const { base64 } = await prepareReportImage(asset.uri);
    if (!base64) return { name: asset.name, kind: 'unsupported', mimeType };
    return { name: asset.name, base64, kind: 'image', mimeType: 'image/jpeg' };
  } catch {
    // Genuinely not a decodable image (a .txt renamed, a corrupt file).
    return { name: asset.name, kind: 'unsupported', mimeType };
  }
}
