/**
 * Waits for a result a test cannot time: a fake model writing tokens on
 * timers, or a screen that chains several database reads and writes.
 *
 * A fixed sleep (setTimeout of 30 or 80 ms) passes on an idle laptop and
 * fails on a busy one. Instead, this lets React and the event loop run in
 * short slices until `check` passes: it may return false or throw (an
 * `expect` that does not hold yet). After `timeoutMs` it throws the last
 * failure, so the report shows the assertion that never came true.
 */

import { act } from 'react-test-renderer';

export async function waitUntil(check: () => unknown | Promise<unknown>, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let failure: unknown;
    try {
      if ((await check()) !== false) {
        return;
      }
      failure = new Error('waitUntil: the condition was still false');
    } catch (e) {
      failure = e;
    }
    if (Date.now() >= deadline) {
      throw failure;
    }
    await act(async () => {
      await new Promise<void>(r => setTimeout(() => r(), 5));
    });
  }
}
