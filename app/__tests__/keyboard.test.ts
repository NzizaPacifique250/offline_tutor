/**
 * The geometry that keeps the field being typed into visible above the soft
 * keyboard, in layout units, with the pilot tablet's band: the header ends
 * at 72 and the keyboard starts at 284 in landscape. The three "behind the
 * keyboard" cases are the fields as measured on the tablet on 2 October
 * 2026, with the scroll the application logged for each.
 */

import { scrollDeltaForInput } from '../src/screens/keyboard';

const band = { viewportTop: 72, keyboardTop: 284 };
const opts = { margin: 16, keepAbove: 44 };

describe('scrollDeltaForInput', () => {
  it('does nothing when the field and its label are inside the band', () => {
    expect(scrollDeltaForInput({ top: 150, height: 47 }, band, opts)).toBe(0);
    expect(scrollDeltaForInput({ top: 116, height: 47 }, band, opts)).toBe(0);
  });

  it.each([
    ['learner code', 405, 47, 184],
    ['lesson question', 391, 47, 170],
    ['practice answer', 351, 48, 131],
  ])('lifts the %s field clear of the keyboard, as measured on the tablet', (_name, top, height, want) => {
    expect(scrollDeltaForInput({ top, height }, band, opts)).toBe(want);
  });

  it('never lifts the field out of the top of the band', () => {
    // A very tall field: lifting it clear would push its top above the header.
    expect(scrollDeltaForInput({ top: 100, height: 300 }, band, opts)).toBe(28);
  });

  it('brings a field that is above the band back down with its label', () => {
    // top 50, label needs 44 above: 72 - (50 - 44) = 66
    expect(scrollDeltaForInput({ top: 50, height: 47 }, band, opts)).toBe(-66);
  });

  it('keeps more above the field when asked, as the practice screen does for the exercise', () => {
    const practice = { margin: 16, keepAbove: 150 };
    // 72 - (160 - 150) = 62 of the exercise hidden; slack below is 284 - 16 - 207 = 61
    expect(scrollDeltaForInput({ top: 160, height: 47 }, band, practice)).toBe(-61);
    // but never so far that the field goes behind the keyboard
    expect(scrollDeltaForInput({ top: 100, height: 160 }, band, practice)).toBe(-8);
  });

  it('a smaller margin leaves the field closer to the keyboard', () => {
    expect(scrollDeltaForInput({ top: 351, height: 48 }, band, { margin: 8, keepAbove: 150 })).toBe(123);
  });
});
