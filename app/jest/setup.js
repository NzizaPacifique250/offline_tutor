/* eslint-env jest */
// Native modules have no JavaScript implementation under Jest, so each one is
// replaced here. llama.rn ships its own mock, which installs a fake RNLlama
// native module and re-exports the real JavaScript API on top of it.

jest.mock('llama.rn', () => require('llama.rn/jest/mock'));

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    WebView: props => React.createElement(View, { testID: 'webview', accessibilityLabel: 'webview', ...props }),
  };
});

jest.mock('@op-engineering/op-sqlite', () => require('./opsqlite-mock'));

// SafeAreaProvider waits for native insets before rendering its children;
// the library's own mock supplies them.
jest.mock('react-native-safe-area-context', () => {
  const m = require('react-native-safe-area-context/jest/mock');
  // The library's mock is an ES-module build: its exports live under `default`.
  return m.default ?? m;
});
