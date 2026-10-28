module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest/setup.js'],
  // Several suites build a real SQLite database (sql.js), import the four
  // curriculum packages, hash passwords and render whole screens. That takes
  // one to two seconds on an idle laptop and more than Jest's default of
  // five under load, and a test that times out leaves its work running into
  // the next one. A hung test still fails, after 30 seconds.
  testTimeout: 30_000,
  // The React Native preset only transforms react-native itself. The three
  // native libraries ship untranspiled source (llama.rn is TypeScript), so
  // they must be transformed too or the App test cannot even import them.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-webview|react-native-safe-area-context|llama\\.rn|@op-engineering)/)',
  ],
};
