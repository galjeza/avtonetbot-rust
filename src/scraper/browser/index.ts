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

export { botProfileDir, ensureBotProfile } from './profile';

export interface BrowserSession {
  browser: Browser;
  page: Page;
  release: () => Promise<void>;
  profileSeeded: boolean;
}

export async function setupBrowser(): Promise<BrowserSession> {
  const chromePath = resolveChromePath();
  if (!chromePath) {
    throw new Error(
      'Google Chrome ni najden. Namestite Chrome ali nastavite pot v konfiguraciji.',
    );
  }

  const profileSeeded = ensureBotProfile();

  if (!(await isPortOpen())) {
    const proc = spawn(
      chromePath,
      [
        `--remote-debugging-port=${DEBUG_PORT}`,
        `--user-data-dir=${botProfileDir()}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--restore-last-session',
      ],
      { detached: true, stdio: 'ignore' },
    );
    proc.unref();

    if (!(await waitForDebugPort(PORT_WAIT_TIMEOUT_MS))) {
      throw new Error(
        'Chroma ni bilo mogoče zagnati z razhroščevalnim vratom. Zaprite vsa okna programa Chrome in poskusite znova.',
      );
    }
  }

  const browser = await puppeteer.connect({
    browserWSEndpoint: await fetchBrowserWSEndpoint(),
    defaultViewport: null,
    protocolTimeout: 0,
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(DEFAULT_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(DEFAULT_TIMEOUT_MS);

  const release = async (): Promise<void> => {
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

  return { browser, page, release, profileSeeded };
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
 * Closes the Chrome we launched, then replaces our profile with a fresh copy
 * of the user's. Chrome must be shut down first — deleting a profile
 * directory out from under a running browser corrupts it.
 */
export async function reseedBotProfile(): Promise<void> {
  if (await isPortOpen()) {
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

  ensureBotProfile(true);
}

/** Reports whether the copied profile still holds a valid avto.net session. */
export async function checkBrowserSession(): Promise<BrowserStatus> {
  const { page, release, profileSeeded } = await setupBrowser();
  try {
    const { loggedIn, finalUrl } = await isLoggedIn(page);
    return { loggedIn, finalUrl, profileSeeded };
  } finally {
    await release().catch(() => undefined);
  }
}
