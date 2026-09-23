module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest/setup.js'],
  // The React Native preset only transforms react-native itself. The three
  // native libraries ship untranspiled source (llama.rn is TypeScript), so
  // they must be transformed too or the App test cannot even import them.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-webview|react-native-safe-area-context|llama\\.rn|@op-engineering)/)',
  ],
};
