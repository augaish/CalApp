import { findNodeHandle, Platform } from 'react-native';
import type { ScrollView, TextInput } from 'react-native';

/**
 * Scrolls a focused TextInput into view above the keyboard — call it from
 * that input's `onFocus` when it lives inside a `Screen`-style
 * KeyboardAvoidingView + ScrollView. RN's own automatic scroll-to-focused-
 * input doesn't reliably fire once a KeyboardAvoidingView is in the
 * ancestry: by the time it measures, the ScrollView's visible height has
 * already changed to make room for the keyboard, so a genuinely low field
 * (a chat-style correction box, a note field with content below it) can end
 * up hidden in the gap between the visible content and the keyboard
 * instead of scrolled up to meet it. iOS only — Android's window already
 * resizes around the keyboard on its own, nothing extra needed there.
 */
export function scrollInputIntoView(
  scrollRef: React.RefObject<ScrollView | null>,
  inputRef: React.RefObject<TextInput | null>,
  extraOffset = 80,
): void {
  if (Platform.OS !== 'ios') return;
  const node = findNodeHandle(inputRef.current);
  if (!node) return;
  // One frame's grace so the KeyboardAvoidingView's own resize has actually
  // happened before measuring against it — measuring in the same tick as
  // focus caught the pre-keyboard layout every time.
  setTimeout(() => {
    scrollRef.current?.scrollResponderScrollNativeHandleToKeyboard(node, extraOffset, true);
  }, 50);
}
