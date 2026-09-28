/**
 * A WebView that draws one KaTeX page from bundled assets and sizes itself to
 * the page, so the surrounding screen scrolls as one surface.
 *
 * KaTeX's JavaScript, stylesheet and fonts are copied into
 * android/app/src/main/assets/katex/ by scripts/sync_katex_assets.sh, and the
 * WebView is given that directory as its base URL. Nothing is fetched from the
 * network, which is the property this component exists to prove.
 *
 * The WebView never scrolls on its own. The page reports its rendered height
 * (again whenever a <details> opens) and the view grows to fit. A fixed-height
 * WebView inside a ScrollView on Android swallowed the gesture without
 * scrolling, which left content unreachable.
 */

import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

const KATEX_BASE_URL = 'file:///android_asset/katex/';

type PageMessage = { type: 'status'; message: string } | { type: 'height'; height: number };

function parseMessage(data: string): PageMessage | null {
  try {
    const m = JSON.parse(data) as Partial<PageMessage>;
    if (m.type === 'status' && typeof m.message === 'string') {
      return m as PageMessage;
    }
    if (m.type === 'height' && typeof m.height === 'number' && Number.isFinite(m.height)) {
      return m as PageMessage;
    }
  } catch {
    // not JSON: fall through
  }
  return null;
}

// Before the page has reported, show enough to make a load failure visible.
const INITIAL_HEIGHT = 240;

export function KatexView({
  html,
  onStatus,
  caption,
  minHeight = INITIAL_HEIGHT,
}: {
  html: string;
  onStatus?: (message: string) => void;
  caption?: string | null;
  minHeight?: number;
}): React.JSX.Element {
  const [height, setHeight] = useState(minHeight);

  const onMessage = useCallback(
    (data: string) => {
      const m = parseMessage(data);
      if (!m) {
        onStatus?.(data);
      } else if (m.type === 'height') {
        setHeight(Math.max(minHeight, Math.ceil(m.height) + 2));
      } else {
        onStatus?.(m.message);
      }
    },
    [minHeight, onStatus],
  );

  return (
    <View style={styles.frame}>
      <WebView
        originWhitelist={['*']}
        source={{ html, baseUrl: KATEX_BASE_URL }}
        allowFileAccess
        allowFileAccessFromFileURLs
        allowUniversalAccessFromFileURLs
        javaScriptEnabled
        domStorageEnabled={false}
        cacheEnabled={false}
        scrollEnabled={false}
        onMessage={e => onMessage(e.nativeEvent.data)}
        onError={e => onStatus?.(`WebView error: ${e.nativeEvent.description}`)}
        style={[styles.web, { height }]}
      />
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderWidth: 1,
    borderColor: '#D3DCE6',
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  web: { width: '100%', backgroundColor: '#FFFFFF' },
  caption: { fontSize: 10, color: '#6B7A88', paddingHorizontal: 8, paddingVertical: 4 },
});
