import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, View, type KeyboardAvoidingViewProps } from 'react-native';

/**
 * KeyboardAvoidingView that knows where it sits on the screen.
 *
 * React Native measures the keyboard against the view's own position inside
 * its parent, so on a screen shown as an iPhone sheet (which starts below the
 * top of the screen) it lifted the content too little and the bottom of it,
 * AI Support's message box for one, stayed half under the keyboard. Here the
 * view's distance from the top of the screen is measured and passed as the
 * offset. A full-screen page measures 0 and behaves as before.
 */
export function KeyboardAvoider({ style, children, behavior = 'padding', ...rest }: KeyboardAvoidingViewProps) {
  const ref = useRef<View>(null);
  const [offset, setOffset] = useState(0);

  const measure = useCallback(() => {
    if (Platform.OS !== 'ios') return;
    ref.current?.measureInWindow((_x, y) => {
      if (!Number.isFinite(y)) return;
      const next = Math.max(0, Math.round(y));
      setOffset((prev) => (prev === next ? prev : next));
    });
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    // Measured again once the sheet has finished sliding up, and whenever the
    // keyboard is about to show, so a mid-animation position never sticks.
    const settle = setTimeout(measure, 600);
    const sub = Keyboard.addListener('keyboardWillShow', measure);
    return () => {
      clearTimeout(settle);
      sub.remove();
    };
  }, [measure]);

  return (
    <View ref={ref} style={{ flex: 1 }} onLayout={measure} collapsable={false}>
      <KeyboardAvoidingView behavior={behavior} {...rest} keyboardVerticalOffset={offset} style={style ?? { flex: 1 }}>
        {children}
      </KeyboardAvoidingView>
    </View>
  );
}

/** Whether the keyboard is up (iOS: as it starts to show; Android: once shown). */
export function useKeyboardShown(): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setShown(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setShown(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return shown;
}
