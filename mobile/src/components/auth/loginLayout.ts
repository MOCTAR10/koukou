/**
 * Sizing of the sign-in screen so it never needs to scroll. Pure and tested:
 * the screen gives the usable height (window height minus the status and
 * navigation bar insets) and gets back the keypad key size and the lockup
 * height that fill it. Everything else on the screen has a fixed height, so
 * the budget below is a plain sum.
 */

export const KEY_MIN = 44; // smallest touch target we accept
export const KEY_MAX = 56;
export const KEY_GAP = 6;
export const LOCKUP_MAX = 52;
export const LOCKUP_MIN = 24;
export const BUTTON_HEIGHT = 48;
export const BAND_HEIGHT = 36; // ministry logos
export const SWITCH_HEIGHT = 46; // buyer sign-in / sign-up switch
export const CREDIT_HEIGHT = 22; // « Plateforme propulsée par » under the card

export interface LoginLayoutInput {
  /** Usable height in dp: window height minus top and bottom insets. */
  height: number;
  /** Text scale actually applied (system font scale capped, times the width scale). */
  textScale: number;
  /** The phone field is shown (false on the SMS-code step). */
  phoneField: boolean;
  /** The buyer switch replaces the lockup. */
  buying: boolean;
  /** An error message is shown (reserves up to two lines). */
  hasError: boolean;
}

export interface LoginLayout {
  key: number;
  /** 0 = lockup hidden (no room). */
  lockupHeight: number;
  /** Estimated height of the whole content, for tests and debugging. */
  contentHeight: number;
  /** The content fits even with the smallest keys. */
  fits: boolean;
}

/** Height of everything but the keypad keys and the lockup. */
function fixedHeight({ textScale: t, phoneField, buying, hasError }: LoginLayoutInput): number {
  const outer = 24; // 8 above the band, 8 below the card, a little slack
  const band = BAND_HEIGHT + 10;
  const card = 30; // padding 14 + border 1, twice
  const phone = phoneField ? 44 + 8 : 0;
  const switchRow = buying ? SWITCH_HEIGHT + 8 : 0;
  const padHeader = Math.ceil(18 * t); // « Code secret · 6 chiffres minimum » on one row
  const dots = 22 + 6;
  const padFrame = 3 * KEY_GAP + 8 + 6; // gaps between the 4 rows, pad padding, gap above the pad
  const button = 8 + BUTTON_HEIGHT;
  const links = 6 + Math.ceil(18 * t) + 12;
  const error = hasError ? 6 + Math.ceil(2 * 16 * t) : 0;
  const credit = 8 + Math.max(CREDIT_HEIGHT, Math.ceil(16 * t));
  return outer + band + card + phone + switchRow + padHeader + dots + padFrame + button + links + error + credit;
}

export function loginLayout(input: LoginLayoutInput): LoginLayout {
  const base = fixedHeight(input);
  let rem = input.height - base - 4 * KEY_MIN;
  const fits = rem >= 0;
  if (input.buying || rem <= 0) {
    // No lockup (the switch stands in for it), keys grow with what is left.
    const key = Math.min(KEY_MAX, KEY_MIN + Math.max(0, Math.floor(rem / 4)));
    return { key, lockupHeight: 0, contentHeight: base + 4 * key, fits };
  }
  // 1. The lockup first, at a modest size; 2. bigger keys; 3. a bigger lockup.
  let lockup = Math.min(36, rem - 8);
  if (lockup < LOCKUP_MIN) lockup = 0;
  else rem -= lockup + 8;
  const key = Math.min(KEY_MAX, KEY_MIN + Math.floor(rem / 4));
  rem -= (key - KEY_MIN) * 4;
  if (lockup > 0) lockup = Math.min(LOCKUP_MAX, lockup + Math.max(0, rem));
  const lockupSpace = lockup > 0 ? lockup + 8 : 0;
  return { key, lockupHeight: lockup, contentHeight: base + 4 * key + lockupSpace, fits };
}
