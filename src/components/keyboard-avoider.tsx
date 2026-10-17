import { useEffect, useState } from 'react';
import { Dimensions, Keyboard, KeyboardAvoidingView, LayoutAnimation, Platform, View, type KeyboardAvoidingViewProps, type KeyboardEvent } from 'react-native';

/**
 * Keeps a page's bottom (a message box, a Save button) above the keyboard.
 *
 * iPhone: the page is lifted by exactly the keyboard's height. React
 * Native's KeyboardAvoidingView works from the view's position inside its
 * parent, and on a screen shown as an iPhone sheet (AI Support, the code
 * screen, every modal) that left the bottom partly under the keyboard; the
 * position on screen can't be measured reliably inside a sheet either. Every
 * page using this reaches the bottom of the phone, sheet or not, so the
 * keyboard's height is the whole overlap.
 * Android: KeyboardAvoidingView with padding, as before (checked on the
 * emulator).
 */
export function KeyboardAvoider({ style, children, behavior = 'padding', ...rest }: KeyboardAvoidingViewProps) {
  const lift = useKeyboardHeight();
  if (Platform.OS !== 'ios') {
    return (
      <KeyboardAvoidingView behavior={behavior} {...rest} style={style ?? { flex: 1 }}>
        {children}
      </KeyboardAvoidingView>
    );
  }
  return <View style={[{ flex: 1 }, style, { paddingBottom: lift }]}>{children}</View>;
}

/** The keyboard's height while it is up on iPhone, 0 otherwise; animated with it. */
function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const animate = (e: KeyboardEvent) => {
      if (e.duration) LayoutAnimation.configureNext({ duration: e.duration, update: { duration: e.duration, type: LayoutAnimation.Types.keyboard } });
    };
    const show = Keyboard.addListener('keyboardWillChangeFrame', (e) => {
      animate(e);
      // How far the keyboard reaches up from the bottom of the screen; one
      // that is closing (or undocked, off the bottom) ends below it: 0.
      const overlap = Dimensions.get('window').height - e.endCoordinates.screenY;
      setHeight(Math.max(0, Math.round(overlap)));
    });
    const hide = Keyboard.addListener('keyboardWillHide', (e) => {
      animate(e);
      setHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
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
