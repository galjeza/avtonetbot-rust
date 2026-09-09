import { spawn } from 'node:child_process';

import puppeteer, { type Browser, type Page } from 'puppeteer-core';

import type { BrowserStatus } from '@shared/types';
import { getUserData, setUserData } from '../../main/store';
import { DEFAULT_TIMEOUT_MS, LOGIN_URL, LOGIN_SUCCESS_URL } from '../constants';
import { resolveChromePath } from './chrome-path';
import { listChromeProfiles } from './chrome-profiles';
import {
  DEBUG_PORT,
  fetchBrowserWSEndpoint,
  isPortOpen,
  waitForDebugPort,
  waitForPortClosed,
} from './devtools';
import { botProfileDir, chosenProfileDir, ensureBotProfile, seededProfileDir } from './profile';

const PORT_WAIT_TIMEOUT_MS = 30 * 1000;

/**
 * How long a check leaves the browser up when the user has asked it to.
 *
 * Long enough to look at the page and click around it, short enough that a
 * forgotten window tidies itself away.
 */
const KEEP_OPEN_MS = 60 * 1000;

/** How long a manual sign-in waits for the user before giving up on them. */
const MANUAL_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

const MANUAL_LOGIN_POLL_MS = 1000;

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
      // The copy keeps the name the profile had in the user's Chrome, which is
      // only "Default" when that is the one we took it from. Without this,
      // Chrome would open an empty Default profile beside it and report the
      // session as signed out.
      `--profile-directory=${seededProfileDir()}`,
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
export { listChromeProfiles };

export interface BrowserSession {
  browser: Browser;
  page: Page;
  /**
   * Disconnects but leaves Chrome running, so the next call can reuse it.
   * Pass false to leave the tab open too, for when the user is using it.
   */
  release: (closePage?: boolean) => Promise<void>;
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
  const release = async (closePage = true): Promise<void> => {
    if (released) return;
    released = true;
    activeSessions = Math.max(0, activeSessions - 1);

    try {
      if (closePage && !page.isClosed()) await page.close();
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
 * Records which of their Chrome profiles the user wants the session copied
 * from, and rebuilds the copy from it.
 *
 * Nothing here infers the profile. Which one holds the avto.net session cannot
 * be read off the files with any certainty — the cookie values are encrypted,
 * so we can see that a profile has *been* on avto.net but not whether it is
 * still signed in — and a wrong guess is invisible until a renewal fails.
 */
export async function selectChromeProfile(profileDir: string): Promise<void> {
  const known = listChromeProfiles().some((profile) => profile.dir === profileDir);
  if (!known) throw new Error(`Chromov profil "${profileDir}" ne obstaja.`);

  const userData = getUserData() ?? { email: '', password: '' };
  setUserData({ ...userData, chromeProfileDir: profileDir });
  await reseedBotProfile();
}

/**
 * Ends a session, unless the user asked for the window to stay up.
 *
 * The wait is deliberately not awaited: the answer is already known, and
 * holding the reply back for a minute would leave the app looking stuck. The
 * window stays on the page the check landed on, which is the whole point — a
 * report of "not signed in" is worth very little next to seeing it.
 */
async function finishInspection(session: BrowserSession): Promise<void> {
  if (getUserData()?.keepBrowserOpen) {
    setTimeout(() => void endSession(session).catch(() => undefined), KEEP_OPEN_MS);
    return;
  }
  await endSession(session);
}

/**
 * Watches every open tab until one lands on the page avto.net redirects to
 * after a successful sign-in.
 *
 * Polling rather than a navigation listener because the user is driving: they
 * may accept the cookie banner, get bounced by Turnstile, retry, or do the
 * whole thing in a tab they opened themselves. Only the destination matters.
 *
 * @returns false if they ran out of time or closed the window.
 */
async function waitForManualLogin(browser: Browser): Promise<boolean> {
  const deadline = Date.now() + MANUAL_LOGIN_TIMEOUT_MS;

  while (Date.now() < deadline) {
    let pages: Page[];
    try {
      pages = await browser.pages();
    } catch {
      return false; // they closed the browser
    }

    for (const page of pages) {
      try {
        if (page.url().startsWith(LOGIN_SUCCESS_URL)) return true;
      } catch {
        /* tab closing as we look at it */
      }
    }

    await new Promise((resolve) => setTimeout(resolve, MANUAL_LOGIN_POLL_MS));
  }

  return false;
}

/**
 * Opens the bot's browser on avto.net and waits for the user to sign in there
 * themselves.
 *
 * This is the way in now, not a fallback. Copying the profile stopped carrying
 * the session on current Windows Chrome — from version 127 cookie values are
 * sealed with app-bound encryption, so the copy arrives with an intact cookie
 * database whose contents Chrome then refuses to decrypt and discards. Filling
 * the form ourselves would work, but a real person typing into a real window
 * is both simpler and the last thing avto.net should want to flag: the login,
 * of everything we do, is what gets looked at hardest.
 *
 * What it leaves behind is a session in our own profile, encrypted with a key
 * that profile can actually use, so it lasts until avto.net expires it.
 */
export async function signInManually(): Promise<BrowserStatus> {
  const session = await setupBrowser();
  let signedIn = false;
  try {
    await session.page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 0 });
    await session.page.bringToFront().catch(() => undefined);

    signedIn = await waitForManualLogin(session.browser);
    return {
      loggedIn: signedIn,
      // Reporting the destination we matched rather than re-reading the tab,
      // which the user may have closed the moment they were done.
      finalUrl: signedIn ? LOGIN_SUCCESS_URL : '',
      profileSeeded: session.profileSeeded,
      profileDir: seededProfileDir(),
    };
  } finally {
    if (signedIn) {
      await endSession(session).catch(() => undefined);
    } else {
      // Running out of time does not mean they gave up — they may be halfway
      // through typing. Disconnect without touching their tab; the next check
      // attaches to the same browser and will see the session if they finish.
      await session.release(false).catch(() => undefined);
    }
  }
}

/**
 * Reports whether the copied profile still holds a valid avto.net session.
 *
 * Leaves the machine as it found it: a check that had to start Chrome shuts it
 * down again, while one that attached to a browser already running — a renewal
 * batch, say — leaves that alone.
 */
export async function checkBrowserSession(): Promise<BrowserStatus> {
  // Until the user has picked a profile there is nothing to check, and
  // starting Chrome on an empty one would only report a signed-out session
  // that says nothing about what is actually needed.
  if (!chosenProfileDir()) {
    return { loggedIn: false, finalUrl: '', profileSeeded: false, profileDir: null };
  }

  const session = await setupBrowser();
  try {
    const { loggedIn, finalUrl } = await isLoggedIn(session.page);
    return {
      loggedIn,
      finalUrl,
      profileSeeded: session.profileSeeded,
      profileDir: seededProfileDir(),
    };
  } finally {
    await finishInspection(session);
  }
}
