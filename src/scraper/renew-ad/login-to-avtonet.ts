import type { Page } from 'puppeteer-core';

import { LOGIN_URL, LOGIN_SUCCESS_URL, DEFAULT_TIMEOUT_MS } from '../constants';
import { wait } from '../utils/wait';

const TYPE_DELAY_MS = 50;
const COOKIE_ACCEPT_SELECTOR = '#CybotCookiebotDialogBodyLevelButtonAccept';

/**
 * Signs in with stored credentials.
 *
 * Only used when the copied browser profile has lost its session — normally
 * the profile arrives already logged in and this is skipped entirely.
 * Cloudflare Turnstile sometimes bounces the first attempt, so we retry once.
 */
export const loginToAvtonet = async (
  page: Page,
  email: string,
  password: string,
): Promise<void> => {
  const emailDomain = email.includes('@') ? email.split('@')[1] : 'unknown';
  console.log('[Login] Navigating to login page', { emailDomain });

  await page.goto(LOGIN_URL, { timeout: 0 });
  await wait(5);

  const acceptCookies = async (): Promise<void> => {
    try {
      await page.waitForSelector(COOKIE_ACCEPT_SELECTOR, { timeout: DEFAULT_TIMEOUT_MS });
      await page.click(COOKIE_ACCEPT_SELECTOR);
      console.log('[Login] Accepted cookies');
    } catch {
      /* banner not shown */
    }
  };

  const fillAndSubmit = async (): Promise<void> => {
    await page.waitForSelector('input[name=enaslov]', { timeout: 0 });
    await wait(5);

    await page.click('input[name=enaslov]', { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type('input[name=enaslov]', email, { delay: TYPE_DELAY_MS });

    await page.click('input[name=geslo]', { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type('input[name=geslo]', password, { delay: TYPE_DELAY_MS });

    await page.$$eval('input[type=checkbox]', (checks) =>
      checks.forEach((check) => (check as HTMLInputElement).click()),
    );

    await page.$eval('button[type=submit]', (button) => (button as HTMLButtonElement).click());
  };

  const waitForLoginOutcome = async (): Promise<string> => {
    await page.waitForFunction(
      (loginUrl: string) => window.location.href !== loginUrl,
      { timeout: 0 },
      LOGIN_URL,
    );
    return page.url();
  };

  await acceptCookies();

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await fillAndSubmit();
    const redirectUrl = await waitForLoginOutcome();
    console.log('[Login] Redirected after submit', { redirectUrl });

    if (redirectUrl.startsWith(LOGIN_SUCCESS_URL)) {
      console.log('[Login] Logged in successfully');
      await wait(10);
      return;
    }

    console.log('[Login] Turnstile redirect detected, retrying login', { redirectUrl });
    await page.goto(LOGIN_URL, { timeout: 0 });
    await wait(5);
    await acceptCookies();
  }

  throw new Error('Prijava v avto.net ni uspela. Preverite e-pošto in geslo v konfiguraciji.');
};
