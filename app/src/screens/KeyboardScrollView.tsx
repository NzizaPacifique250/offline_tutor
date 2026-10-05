/**
 * A ScrollView for screens with a text field. While the soft keyboard is
 * up it adds bottom space equal to the keyboard's height, so the content
 * can scroll far enough, and it scrolls the focused field into the band
 * above the keyboard, keeping its label (or the exercise) in view. When the
 * keyboard closes the space is removed. The geometry is in keyboard.ts.
 *
 * Taps on buttons while the keyboard is open are delivered
 * (keyboardShouldPersistTaps), and every field submits from the keyboard's
 * own action key, so nothing has to be reached underneath it.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  ScrollView,
  TextInput,
  type KeyboardEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { log } from '../log';
import { scrollDeltaForInput } from './keyboard';

/** Height of the header in App.tsx; it sits directly under the status bar. */
const HEADER_HEIGHT = 48;
/** Clear space between the field and the keyboard, in layout units. */
const MARGIN = 8;

type Measurable = { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void };

export function KeyboardScrollView({
  children,
  contentContainerStyle,
  keepAbove = 44,
  ...rest
}: ScrollViewProps & {
  /** How much above the focused field to keep visible: its label by default. */
  keepAbove?: number;
  contentContainerStyle?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const ref = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const offset = useRef(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  // The visible band starts under the header: 72 on the pilot tablet.
  const viewportTop = useSafeAreaInsets().top + HEADER_HEIGHT;

  useEffect(() => {
    const reveal = (e: KeyboardEvent) => {
      const height = e.endCoordinates.height;
      const keyboardTop = e.endCoordinates.screenY;
      setKeyboardHeight(height);
      // Measure after the extra bottom space has been laid out.
      setTimeout(() => {
        const input = TextInput.State.currentlyFocusedInput() as Measurable | null;
        input?.measureInWindow?.((_x, y, _w, h) => {
          const delta = scrollDeltaForInput({ top: y, height: h }, { viewportTop, keyboardTop }, { margin: MARGIN, keepAbove });
          log('keyboard', `shown: top ${Math.round(keyboardTop)}, field ${Math.round(y)}–${Math.round(y + h)}, scroll by ${delta}`);
          if (delta !== 0) {
            ref.current?.scrollTo({ y: Math.max(0, offset.current + delta), animated: true });
          }
        });
      }, 120);
    };
    const show = Keyboard.addListener('keyboardDidShow', reveal);
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [keepAbove, viewportTop]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = e.nativeEvent.contentOffset.y;
    rest.onScroll?.(e);
  };

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      {...rest}
      ref={ref}
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={[contentContainerStyle, keyboardHeight > 0 ? { paddingBottom: keyboardHeight + MARGIN } : null]}>
      {children}
    </ScrollView>
  );
}
