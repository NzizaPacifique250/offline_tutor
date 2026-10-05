/**
 * Where to scroll so the field being typed into is visible above the soft
 * keyboard.
 *
 * The app is drawn edge to edge, and on Android 15 an edge-to-edge window is
 * no longer resized for the keyboard, so the keyboard simply covers the
 * lower part of the screen. On the pilot tablet in landscape that leaves a
 * band about 210 layout units tall between the header (72) and the keyboard
 * (284). The focused
 * field must sit inside that band, with what is directly above it (its
 * label, or on the practice screen the exercise itself) still in view.
 *
 * Pure: window coordinates in, a scroll delta out. Unit-tested.
 */

export type KeyboardBand = {
  /** Bottom of the fixed header: the top of the visible band. */
  viewportTop: number;
  /** Top edge of the keyboard: the bottom of the visible band. */
  keyboardTop: number;
};

export type InputBox = { top: number; height: number };

export type ScrollOptions = {
  /** Clear space kept between the field and the keyboard. */
  margin: number;
  /** How much above the field should stay visible (label, or the question). */
  keepAbove: number;
};

/**
 * Positive: scroll the content up by that much (the field is hidden behind
 * the keyboard). Negative: scroll down (the field is above the band).
 * Zero: already visible.
 */
export function scrollDeltaForInput(input: InputBox, band: KeyboardBand, opts: ScrollOptions): number {
  const bottom = input.top + input.height;
  const tooLow = bottom + opts.margin - band.keyboardTop;
  if (tooLow > 0) {
    // Lift the field clear of the keyboard, but never so far that the field
    // itself leaves the top of the band; keepAbove yields first.
    const room = input.top - band.viewportTop;
    return Math.round(Math.min(tooLow, Math.max(room, 0)));
  }
  const above = band.viewportTop - (input.top - opts.keepAbove);
  if (above > 0) {
    // Bring the label back, but keep the field above the keyboard.
    const slack = band.keyboardTop - opts.margin - bottom;
    return -Math.round(Math.min(above, Math.max(slack, 0)));
  }
  return 0;
}
