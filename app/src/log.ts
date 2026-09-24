/**
 * One-line diagnostics for the debug build. They appear under the
 * ReactNativeJS tag in logcat, which is how the tablet checks are read.
 */
export function log(tag: string, message: string): void {
  console.log(`[${tag}] ${message}`);
}
