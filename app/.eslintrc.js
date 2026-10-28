module.exports = {
  root: true,
  extends: '@react-native',
  // Third-party runtime copied by scripts/sync_katex_assets.sh, and the
  // copies the Android build makes of it.
  ignorePatterns: ['android/app/src/main/assets/katex/', 'android/app/build/'],
};
