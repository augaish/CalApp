import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import { I18nManager } from 'react-native';

import { en } from './locales/en';
import { ar } from './locales/ar';
import type { Language } from './types';

export function deviceLanguage(): Language {
  return getLocales()[0]?.languageCode === 'ar' ? 'ar' : 'en';
}

export function initI18n(language: Language) {
  if (!i18n.isInitialized) {
    // eslint-disable-next-line import/no-named-as-default-member
    i18n.use(initReactI18next).init({
      resources: { en: { translation: en }, ar: { translation: ar } },
      lng: language,
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
    });
  } else {
    // eslint-disable-next-line import/no-named-as-default-member
    i18n.changeLanguage(language);
  }
  return i18n;
}

export function isRTL(language: Language): boolean {
  return language === 'ar';
}

/**
 * Apply RTL layout direction for the given language.
 * Returns true when the change requires an app reload to take effect.
 */
export function applyRTL(language: Language): boolean {
  const rtl = isRTL(language);
  I18nManager.allowRTL(rtl);
  if (I18nManager.isRTL !== rtl) {
    I18nManager.forceRTL(rtl);
    return true;
  }
  return false;
}

export default i18n;
