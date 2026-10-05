import { Ionicons } from '@expo/vector-icons';
import { requireOptionalNativeModule } from 'expo';
import type { SFSymbol } from 'expo-symbols';
import type { ComponentProps, ComponentType } from 'react';
import { I18nManager, Platform, type ColorValue, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import i18n from '@/lib/i18n';

/**
 * One icon component for the whole app.
 *
 * On iPhone it draws the matching SF Symbol — Apple's own icon set, drawn to
 * sit on the same baseline and weight as San Francisco text — and on Android
 * and the web it draws the Ionicons glyph the app has always used. Screens
 * keep speaking Ionicons names; the map below is the only place that knows
 * both vocabularies. A name with no SF equivalent, or a binary without the
 * symbols module, falls back to Ionicons, so nothing ever renders blank.
 */

export type IconName = ComponentProps<typeof Ionicons>['name'];

/** Ionicons name → SF Symbol name. Outline variants map to the plain symbol, filled to `.fill`. */
// Typed against Apple's symbol list, so a misspelt name fails the build
// instead of drawing nothing.
const SF: Partial<Record<string, SFSymbol>> = {
  add: 'plus',
  'add-circle': 'plus.circle.fill',
  'add-circle-outline': 'plus.circle',
  'alert-circle': 'exclamationmark.circle.fill',
  'alert-circle-outline': 'exclamationmark.circle',
  'arrow-back': 'arrow.left',
  'arrow-down': 'arrow.down',
  'arrow-forward': 'arrow.right',
  'arrow-undo': 'arrow.uturn.backward',
  'arrow-up-circle': 'arrow.up.circle.fill',
  attach: 'paperclip',
  barbell: 'dumbbell.fill',
  'barbell-outline': 'dumbbell',
  'barcode-outline': 'barcode',
  'bed-outline': 'bed.double',
  body: 'figure.stand',
  'body-outline': 'figure.stand',
  'bookmark-outline': 'bookmark',
  'bookmarks-outline': 'books.vertical',
  bulb: 'lightbulb.fill',
  'bulb-outline': 'lightbulb',
  'calculator-outline': 'function',
  calendar: 'calendar',
  'calendar-outline': 'calendar',
  camera: 'camera.fill',
  'camera-outline': 'camera',
  'caret-down': 'arrowtriangle.down.fill',
  'caret-up': 'arrowtriangle.up.fill',
  cart: 'cart.fill',
  'cart-outline': 'cart',
  'chatbubble-ellipses-outline': 'ellipsis.bubble',
  chatbubbles: 'bubble.left.and.bubble.right.fill',
  checkbox: 'checkmark.square.fill',
  checkmark: 'checkmark',
  'checkmark-circle': 'checkmark.circle.fill',
  'checkmark-circle-outline': 'checkmark.circle',
  'checkmark-done': 'checkmark.circle.fill',
  'chevron-back': 'chevron.left',
  'chevron-down': 'chevron.down',
  'chevron-forward': 'chevron.right',
  'chevron-up': 'chevron.up',
  close: 'xmark',
  'close-circle': 'xmark.circle.fill',
  'close-circle-outline': 'xmark.circle',
  'cloud-outline': 'icloud',
  'contrast-outline': 'circle.lefthalf.filled',
  'copy-outline': 'doc.on.doc',
  'create-outline': 'square.and.pencil',
  'cube-outline': 'shippingbox',
  'document-attach-outline': 'doc.badge.plus',
  'document-text-outline': 'doc.text',
  'download-outline': 'square.and.arrow.down',
  'ellipse-outline': 'circle',
  'fast-food-outline': 'takeoutbag.and.cup.and.straw',
  'fitness-outline': 'figure.run',
  'flag-outline': 'flag',
  flag: 'flag.fill',
  flame: 'flame.fill',
  'flame-outline': 'flame',
  grid: 'square.grid.2x2.fill',
  'grid-outline': 'square.grid.2x2',
  heart: 'heart.fill',
  'heart-outline': 'heart',
  'help-circle-outline': 'questionmark.circle',
  home: 'house.fill',
  'home-outline': 'house',
  'image-outline': 'photo',
  images: 'photo.on.rectangle.angled',
  'images-outline': 'photo.on.rectangle',
  infinite: 'infinity',
  'information-circle-outline': 'info.circle',
  'layers-outline': 'square.3.layers.3d',
  'link-outline': 'link',
  'list-outline': 'list.bullet',
  'lock-closed': 'lock.fill',
  'log-out-outline': 'rectangle.portrait.and.arrow.right',
  'mail-outline': 'envelope',
  'notifications-off-outline': 'bell.slash',
  'notifications-outline': 'bell',
  nutrition: 'carrot.fill',
  'nutrition-outline': 'carrot',
  'open-outline': 'arrow.up.right.square',
  options: 'slider.horizontal.3',
  'options-outline': 'slider.horizontal.3',
  'paper-plane': 'paperplane.fill',
  pause: 'pause.fill',
  pencil: 'pencil',
  'pencil-outline': 'pencil',
  person: 'person.fill',
  'person-remove-outline': 'person.badge.minus',
  play: 'play.fill',
  'play-outline': 'play',
  pricetag: 'tag.fill',
  'pricetag-outline': 'tag',
  'qr-code-outline': 'qrcode',
  'radio-button-off': 'circle',
  'radio-button-on': 'largecircle.fill.circle',
  refresh: 'arrow.clockwise',
  remove: 'minus',
  'resize-outline': 'arrow.up.left.and.arrow.down.right',
  restaurant: 'fork.knife',
  'restaurant-outline': 'fork.knife',
  rocket: 'paperplane.fill',
  'save-outline': 'square.and.arrow.down',
  'scale-outline': 'scalemass',
  scan: 'viewfinder',
  'scan-outline': 'viewfinder',
  search: 'magnifyingglass',
  'search-outline': 'magnifyingglass',
  'settings-outline': 'gearshape',
  'share-outline': 'square.and.arrow.up',
  'shield-checkmark-outline': 'checkmark.shield',
  sparkles: 'sparkles',
  'sparkles-outline': 'sparkles',
  'square-outline': 'square',
  'star-outline': 'star',
  'stats-chart': 'chart.bar.fill',
  'stats-chart-outline': 'chart.bar',
  'storefront-outline': 'storefront',
  'swap-horizontal': 'arrow.left.arrow.right',
  'time-outline': 'clock',
  'timer-outline': 'timer',
  trash: 'trash.fill',
  'trash-outline': 'trash',
  'trending-up': 'chart.line.uptrend.xyaxis',
  trophy: 'trophy.fill',
  'walk-outline': 'figure.walk',
  warning: 'exclamationmark.triangle.fill',
  'watch-outline': 'applewatch',
  water: 'drop.fill',
  'water-outline': 'drop',
};

/** True when this binary can draw SF Symbols (iOS, with the symbols module linked). */
const symbolsAvailable = Platform.OS === 'ios' && requireOptionalNativeModule('SymbolModule') != null;

type SymbolViewType = ComponentType<{
  name: string;
  size?: number;
  tintColor?: ColorValue;
  type?: 'monochrome' | 'hierarchical' | 'palette' | 'multicolor';
  style?: StyleProp<ViewStyle>;
  fallback?: React.ReactNode;
}>;

// Resolved once at load, and only when the native side is present: an older
// binary without the module never evaluates expo-symbols at all.
const SymbolView: SymbolViewType | null = symbolsAvailable
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('expo-symbols') as { SymbolView: SymbolViewType }).SymbolView
  : null;

/**
 * Arrows that mean "forward" or "back" point the other way in Arabic. Screens
 * keep saying chevron-forward for "go on" and chevron-back for "go back"; the
 * icon flips them when the layout runs right to left. (The SF names above are
 * the fixed chevron.right / chevron.left, which never flip by themselves.)
 */
const MIRRORED: Partial<Record<string, IconName>> = {
  'chevron-forward': 'chevron-back',
  'chevron-back': 'chevron-forward',
  'chevron-forward-outline': 'chevron-back-outline',
  'chevron-back-outline': 'chevron-forward-outline',
  'arrow-forward': 'arrow-back',
  'arrow-back': 'arrow-forward',
  'caret-forward': 'caret-back',
  'caret-back': 'caret-forward',
  'play-forward': 'play-back',
  'play-back': 'play-forward',
};

/** Whether the app is laid out right to left (Arabic). */
export function layoutIsRTL(): boolean {
  // On the web the page turns right-to-left with the language, at once; a
  // phone only after the restart the language switch asks for.
  if (Platform.OS === 'web') return i18n.language === 'ar';
  return I18nManager.isRTL;
}

export function Icon({
  name: requested,
  size = 20,
  color,
  style,
  noMirror,
}: {
  name: IconName;
  size?: number;
  color?: ColorValue;
  style?: StyleProp<TextStyle>;
  /** Keep the arrow as drawn in Arabic too (a physical direction, not forward/back). */
  noMirror?: boolean;
}) {
  const name = (!noMirror && layoutIsRTL() && MIRRORED[requested as string]) || requested;
  const fallback = <Ionicons name={name} size={size} color={color} style={style} />;
  const sf = SF[name as string];
  if (!SymbolView || !sf) return fallback;
  // SF Symbols draw slightly larger than Ionicons at the same point size;
  // 0.92 keeps rows and buttons the height they were designed at.
  return (
    <SymbolView
      name={sf}
      size={Math.round(size * 0.92)}
      tintColor={color}
      type="monochrome"
      style={[{ width: size, height: size }, style as StyleProp<ViewStyle>]}
      fallback={fallback}
    />
  );
}

/** Ionicons' glyph table, for components typed on icon names. */
Icon.glyphMap = Ionicons.glyphMap;
