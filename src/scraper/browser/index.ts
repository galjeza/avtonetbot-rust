import { spawn } from 'node:child_process';

import puppeteer, { type Browser, type Page } from 'puppeteer-core';

import type { BrowserStatus } from '@shared/types';
import { DEFAULT_TIMEOUT_MS, LOGIN_SUCCESS_URL } from '../constants';
import { resolveChromePath } from './chrome-path';
import {
  DEBUG_PORT,
  fetchBrowserWSEndpoint,
  isPortOpen,
  waitForDebugPort,
  waitForPortClosed,
} from './devtools';
import { botProfileDir, ensureBotProfile } from './profile';

const PORT_WAIT_TIMEOUT_MS = 30 * 1000;

/**
 * Guards the launch step. Two concurrent callers would each see a closed debug
 * port and each start a browser, so the second shares the first's promise
 * rather than spawning its own.
 */
let launching: Promise<boolean> | null = null;

/**
 * How many sessions currently hold the browser, and whether we were the ones
 * who started it.
 *
 * Concurrent callers share the launch promise above, so they all see
 * `launched === true`. If each then closed the browser, the first close would
 * tear down the page the others are still driving — which surfaces as
 * "Navigating frame was detached". Ownership is tracked here instead, so only
 * the last session out turns the lights off.
 */
let activeSessions = 0;
let startedByUs = false;

/**
 * Starts Chrome on our profile if it is not already running.
 *
 * @returns true when this call started it.
 */
async function launchIfNeeded(chromePath: string): Promise<boolean> {
  if (await isPortOpen()) return false;

  const proc = spawn(
    chromePath,
    [
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${botProfileDir()}`,
      '--no-first-run',
      '--no-default-browser-check',
      // Deliberately no --restore-last-session. The profile is a copy of the
      // user's, so restoring would reopen every window and tab they had open
      // when it was taken. The bot browser starts empty and we drive it.
    ],
    { detached: true, stdio: 'ignore' },
  );
  proc.unref();

  if (!(await waitForDebugPort(PORT_WAIT_TIMEOUT_MS))) {
    throw new Error(
      'Chroma ni bilo mogoče zagnati z razhroščevalnim vratom. Zaprite vsa okna programa Chrome in poskusite znova.',
    );
  }

  return true;
}

export { botProfileDir, ensureBotProfile } from './profile';

export interface BrowserSession {
  browser: Browser;
  page: Page;
  /** Disconnects but leaves Chrome running, so the next call can reuse it. */
  release: () => Promise<void>;
  profileSeeded: boolean;
  /** True when this call started Chrome, rather than attaching to a running one. */
  launched: boolean;
}

export async function setupBrowser(): Promise<BrowserSession> {
  const chromePath = resolveChromePath();
  if (!chromePath) {
    throw new Error('Google Chrome ni najden. Namestite Chrome ali nastavite pot v konfiguraciji.');
  }

  const profileSeeded = ensureBotProfile();

  const launched = await (launching ??= launchIfNeeded(chromePath).finally(() => {
    launching = null;
  }));
  if (launched) startedByUs = true;
  activeSessions += 1;

  const browser = await puppeteer.connect({
    browserWSEndpoint: await fetchBrowserWSEndpoint(),
    defaultViewport: null,
    protocolTimeout: 0,
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(DEFAULT_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(DEFAULT_TIMEOUT_MS);

  let released = false;
  const release = async (): Promise<void> => {
    if (released) return;
    released = true;
    activeSessions = Math.max(0, activeSessions - 1);

    try {
      if (!page.isClosed()) await page.close();
    } catch {
      /* already gone */
    }
    try {
      await browser.disconnect();
    } catch {
      /* already gone */
    }
  };

  return { browser, page, release, profileSeeded, launched };
}

/**
 * Asks for the account page and reports where we land. A redirect away from
 * it means the copied session has expired.
 */
export async function isLoggedIn(page: Page): Promise<{ loggedIn: boolean; finalUrl: string }> {
  await page.goto(LOGIN_SUCCESS_URL, { waitUntil: 'domcontentloaded', timeout: 0 });
  const finalUrl = page.url();
  return { loggedIn: finalUrl.startsWith(LOGIN_SUCCESS_URL), finalUrl };
}

/**
 * Ends a session, and shuts Chrome down when we started it and nothing else is
 * still using it. This is what callers should use instead of deciding for
 * themselves whether to close.
 */
export async function endSession(session: BrowserSession): Promise<void> {
  await session.release().catch(() => undefined);
  if (startedByUs && activeSessions === 0) {
    await closeBrowser().catch(() => undefined);
  }
}

/** Shuts down the Chrome running on our profile, if there is one. */
export async function closeBrowser(): Promise<void> {
  startedByUs = false;
  if (!(await isPortOpen())) return;

  try {
    const browser = await puppeteer.connect({
      browserWSEndpoint: await fetchBrowserWSEndpoint(),
    });
    await browser.close();
  } catch {
    /* already gone */
  }

  await waitForPortClosed(10_000);
}

/**
 * Closes the Chrome we launched, then replaces our profile with a fresh copy
 * of the user's. Chrome must be shut down first — deleting a profile
 * directory out from under a running browser corrupts it.
 */
export async function reseedBotProfile(): Promise<void> {
  await closeBrowser();
  ensureBotProfile(true);
}

/**
 * Reports whether the copied profile still holds a valid avto.net session.
 *
 * Leaves the machine as it found it: a check that had to start Chrome shuts it
 * down again, while one that attached to a browser already running — a renewal
 * batch, say — leaves that alone.
 */
export async function checkBrowserSession(): Promise<BrowserStatus> {
  const session = await setupBrowser();
  try {
    const { loggedIn, finalUrl } = await isLoggedIn(session.page);
    return { loggedIn, finalUrl, profileSeeded: session.profileSeeded };
  } finally {
    await endSession(session);
  }
}
