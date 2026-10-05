import { Children, isValidElement, useSyncExternalStore, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Text as RNText,
  TextInput as RNTextInput,
  type TextInputProps,
  type TextProps,
} from 'react-native';

import { toArabicDigits } from '@/lib/digits';
import i18n from '@/lib/i18n';
import { normalizeDigits } from '@/lib/numbers';

/**
 * The app's Text and TextInput: React Native's own, except that in Arabic
 * numbers show in Arabic-Indic digits (٠–٩). Every screen imports these
 * instead of react-native's, so the rule lives in one place.
 */

/** The native input, for refs (`useRef<TextInputHandle>`). */
export type TextInputHandle = RNTextInput;

const onLanguage = (cb: () => void) => {
  i18n.on('languageChanged', cb);
  return () => i18n.off('languageChanged', cb);
};
/** Subscribed, so a number-only label (memoised, its props never change)
 * still turns Arabic when the saved language loads after the first draw. */
const useArabic = () => useSyncExternalStore(onLanguage, () => i18n.language === 'ar', () => i18n.language === 'ar');

function localize(children: ReactNode): ReactNode {
  if (typeof children === 'string') return toArabicDigits(children);
  if (typeof children === 'number') return toArabicDigits(String(children));
  if (Array.isArray(children)) return Children.map(children, (c) => (isValidElement(c) ? c : localize(c)));
  return children;
}

export function Text({ latinDigits, children, ...props }: TextProps & { latinDigits?: boolean; ref?: React.Ref<RNText> }) {
  const arabic = useArabic();
  return <RNText {...props}>{!latinDigits && arabic ? localize(children) : children}</RNText>;
}

const NUMERIC = new Set(['numeric', 'number-pad', 'decimal-pad', 'phone-pad']);

/**
 * Number fields show Arabic-Indic digits in Arabic, and hand back Western
 * ones, so every parseFloat behind them keeps working. Text fields (names,
 * notes) are left exactly as typed.
 */
export function TextInput({ ref, ...props }: TextInputProps & { ref?: React.Ref<RNTextInput> }) {
  // Subscribed, so a box filled before the saved language loaded is redrawn:
  // a defaultValue is only read when the box appears, hence the key.
  const { i18n: tr } = useTranslation();
  const numeric = NUMERIC.has(props.keyboardType ?? '');
  if (tr.language !== 'ar' || !numeric) return <RNTextInput key={numeric ? tr.language : undefined} ref={ref} {...props} />;
  const { value, defaultValue, placeholder, onChangeText } = props;
  return (
    <RNTextInput
      key="ar"
      ref={ref}
      {...props}
      value={value == null ? value : toArabicDigits(value)}
      defaultValue={defaultValue == null ? defaultValue : toArabicDigits(defaultValue)}
      placeholder={placeholder == null ? placeholder : toArabicDigits(placeholder)}
      onChangeText={onChangeText ? (text) => onChangeText(normalizeDigits(text)) : undefined}
    />
  );
}

