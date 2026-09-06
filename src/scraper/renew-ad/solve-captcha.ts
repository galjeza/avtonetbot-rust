import type { Page } from 'puppeteer-core';

import { wait } from '../utils/wait';

/**
 * avto.net guards submissions with an arithmetic captcha ("3 + 4 = ?") that
 * lives in the second-to-last table on the page. Typing is deliberately slow
 * and spaced out; submitting instantly reads as automation.
 */
export const solveCaptcha = async (page: Page): Promise<void> => {
  const captchaElement = await page.$('input[name="ReadTotal"]');
  if (!captchaElement) {
    console.log('[solveCaptcha] Captcha input not found');
    return;
  }

  const tables = await page.$$('table');
  const secondLastTable = tables[tables.length - 2];
  if (!secondLastTable) {
    console.log('[solveCaptcha] Captcha table not found');
    return;
  }

  const captchaText = await secondLastTable.evaluate((table) => {
    const firstParagraph = table.querySelector('p');
    return firstParagraph ? firstParagraph.textContent : null;
  });

  if (!captchaText) {
    console.log('[solveCaptcha] Captcha text not found');
    return;
  }

  const captchaNumbers = captchaText.match(/\d+/g);
  if (!captchaNumbers || captchaNumbers.length !== 2) {
    console.log('[solveCaptcha] Captcha numbers not found', { captchaText });
    return;
  }

  const sum = parseInt(captchaNumbers[0], 10) + parseInt(captchaNumbers[1], 10);
  console.log('[solveCaptcha] Captcha parsed', { captchaNumbers, sum });

  await page.click('input[name="ReadTotal"]', { clickCount: 3 });
  await wait(2);
  await page.keyboard.press('Backspace');
  await wait(2);

  for (const digit of sum.toString()) {
    await page.type('input[name="ReadTotal"]', digit, { delay: 150 });
    await wait(2);
  }

  await wait(12);
};
