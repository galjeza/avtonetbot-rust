import type { Page } from 'puppeteer-core';

import { waitMs } from './wait';

/**
 * Timing and pointer helpers that avoid a machine-perfect rhythm.
 *
 * Everything here shapes *when* and *how* we act, never what the browser
 * reports about itself. Fingerprint values are left alone on purpose: we drive
 * the user's real Chrome with their real profile, so navigator.webdriver is
 * already false, plugins are real and hardware values are true. Overriding any
 * of that would replace consistent facts with detectable lies.
 */

/**
 * Log-normal delay. Humans cluster around a typical value with a long tail of
 * occasional slow reactions; a uniform random spread does not look like that.
 */
function humanDelayMs(baseMs = 500, spread = 100): number {
  const u = Math.random();
  const v = Math.random();
  const z = Math.sqrt(-2 * Math.log(u || Number.EPSILON)) * Math.cos(2 * Math.PI * v);
  return Math.max(60, Math.floor(Math.exp(z * 0.35) * spread + baseMs));
}

/** Short pause between individual actions. */
export const humanPause = (baseMs = 500, spread = 100): Promise<void> =>
  waitMs(humanDelayMs(baseMs, spread));

/**
 * Replaces a fixed `wait(seconds)` with the same intent plus jitter, so a run
 * does not produce an identical timing signature every time.
 */
export const jitteredWait = (seconds: number, ratio = 0.25): Promise<void> => {
  const ms = seconds * 1000;
  const delta = ms * ratio;
  return waitMs(Math.max(0, ms - delta + Math.random() * 2 * delta));
};

/** Cubic Bézier point, used to curve the pointer path. */
function bezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

/** Ease-in-out, so the pointer accelerates and settles rather than sliding linearly. */
const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

let lastX = 0;
let lastY = 0;

/**
 * Moves the pointer along a curved path with randomised control points.
 * A straight, instant jump to an element centre is the tell that `page.click`
 * leaves behind.
 */
async function humanMouseMove(page: Page, targetX: number, targetY: number): Promise<void> {
  const startX = lastX;
  const startY = lastY;

  const dx = targetX - startX;
  const dy = targetY - startY;
  const distance = Math.hypot(dx, dy);

  // Control points sit off the direct line so the path bows.
  const bow = Math.min(120, Math.max(20, distance * 0.25));
  const c1x = startX + dx * 0.3 + (Math.random() - 0.5) * bow;
  const c1y = startY + dy * 0.3 + (Math.random() - 0.5) * bow;
  const c2x = startX + dx * 0.7 + (Math.random() - 0.5) * bow;
  const c2y = startY + dy * 0.7 + (Math.random() - 0.5) * bow;

  const steps = Math.min(40, Math.max(12, Math.round(distance / 18)));
  for (let i = 1; i <= steps; i += 1) {
    const t = ease(i / steps);
    await page.mouse.move(
      bezier(t, startX, c1x, c2x, targetX),
      bezier(t, startY, c1y, c2y, targetY),
    );
    await waitMs(6 + Math.random() * 12);
  }

  lastX = targetX;
  lastY = targetY;
}

/**
 * Moves to an element, pauses as if reading it, then clicks slightly off
 * centre. Falls back to a plain click when the element has no box (offscreen
 * or zero-sized), so callers never have to special-case that.
 */
export async function humanClick(page: Page, selector: string): Promise<void> {
  const element = await page.$(selector);
  if (!element) throw new Error(`Elementa "${selector}" ni bilo mogoče najti.`);

  const box = await element.boundingBox();
  if (!box) {
    await element.click();
    return;
  }

  // Aim for the middle band of the element, not its exact centre.
  const targetX = box.x + box.width * (0.35 + Math.random() * 0.3);
  const targetY = box.y + box.height * (0.35 + Math.random() * 0.3);

  await humanMouseMove(page, targetX, targetY);
  await humanPause(140, 60);
  await page.mouse.down();
  await waitMs(40 + Math.random() * 80);
  await page.mouse.up();
}

/** Clears a field the way a person would, then types the replacement. */
export async function humanReplace(page: Page, selector: string, text: string): Promise<void> {
  await humanClick(page, selector);
  await page.click(selector, { clickCount: 3 });
  await humanPause(120, 60);
  await page.keyboard.press('Backspace');
  await humanPause(150, 80);

  for (const char of text) {
    await page.keyboard.type(char, { delay: 0 });
    await waitMs(55 + Math.random() * 110);
  }
}
