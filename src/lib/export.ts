import { requireOptionalNativeModule } from 'expo';
import { Alert, Platform, Share } from 'react-native';

import { buildExport } from './account';
import i18n from './i18n';
import { buildReportHtml } from './report';
import { useAppStore } from './store';

/**
 * Profile / Health → Export my data: a choice of
 *  - a PDF report (lib/report.ts), to read, keep or send to a coach or doctor;
 *  - the data file (.json), everything the app holds, for a copy of one's
 *    own data or another app.
 * Both are handed over as files through the system share sheet.
 *
 * Printing and file sharing are native modules added in a later build; on a
 * binary without them (reached by an over-the-air update) the data file is
 * shared as text, as before, and the report says it needs the update.
 */

type PrintModule = typeof import('expo-print');
type SharingModule = typeof import('expo-sharing');
type FsModule = typeof import('expo-file-system/legacy');

const Print: PrintModule | null =
  Platform.OS !== 'web' && requireOptionalNativeModule('ExpoPrint') != null
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('expo-print') as PrintModule)
    : null;
const Sharing: SharingModule | null =
  Platform.OS !== 'web' && requireOptionalNativeModule('ExpoSharing') != null
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('expo-sharing') as SharingModule)
    : null;

async function fs(): Promise<FsModule | null> {
  try {
    return await import('expo-file-system/legacy');
  } catch {
    return null;
  }
}

const stamp = () => new Date().toISOString().slice(0, 10);

/** The PDF report, shared as "Calgym report 2026-09-29.pdf". */
export async function exportReport(): Promise<void> {
  const lang = i18n.language === 'ar' ? 'ar' : 'en';
  const html = buildReportHtml(useAppStore.getState(), i18n.t.bind(i18n), lang);
  if (Platform.OS === 'web') {
    // The browser's own print dialog saves it as PDF.
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(html);
      w.document.close();
      w.focus();
      w.print();
    }
    return;
  }
  if (!Print || !Sharing) {
    Alert.alert(i18n.t('export.updateTitle'), i18n.t('export.updateBody'));
    return;
  }
  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
  // A name a person recognises in Files or an email, not a random one.
  let shareUri = uri;
  const FS = await fs();
  if (FS?.cacheDirectory) {
    const named = `${FS.cacheDirectory}${i18n.t('export.reportFile', { date: stamp() })}.pdf`;
    try {
      await FS.deleteAsync(named, { idempotent: true });
      await FS.moveAsync({ from: uri, to: named });
      shareUri = named;
    } catch {
      // Keep the generated name.
    }
  }
  await Sharing.shareAsync(shareUri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: i18n.t('export.reportTitle') });
}

/** Everything the app holds, as calgym-data-2026-09-29.json. */
export async function exportDataFile(): Promise<void> {
  const json = buildExport();
  const FS = await fs();
  if (Sharing && FS?.cacheDirectory) {
    const path = `${FS.cacheDirectory}calgym-data-${stamp()}.json`;
    await FS.writeAsStringAsync(path, json);
    await Sharing.shareAsync(path, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: i18n.t('export.dataTitle') });
    return;
  }
  await Share.share({ message: json });
}

/** Ask which: the report or the data file. (The web preview goes straight to the report.) */
export function chooseExport(): void {
  if (Platform.OS === 'web') {
    void exportReport();
    return;
  }
  const run = (fn: () => Promise<void>) => () => {
    fn().catch((err) => {
      // A dismissed share sheet is not an error worth showing.
      if (String(err).toLowerCase().includes('cancel')) return;
      Alert.alert(i18n.t('export.failedTitle'), i18n.t('export.failedBody'));
    });
  };
  Alert.alert(i18n.t('export.chooseTitle'), i18n.t('export.chooseBody'), [
    { text: i18n.t('export.report'), onPress: run(exportReport) },
    { text: i18n.t('export.dataFile'), onPress: run(exportDataFile) },
    { text: i18n.t('common.cancel'), style: 'cancel' },
  ]);
}
