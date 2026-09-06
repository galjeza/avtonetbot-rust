import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';
import type { Page } from 'puppeteer-core';

import type { AdType } from '@shared/types';
import { AVTONET_EDIT_PREFIX, AVTONET_IMAGES_PREFIX, SLOW_TIMEOUT_MS } from '../constants';
import { getAdImagesDirectory, type CarField } from '../utils/ad-images';
import { downloadImage, reduceSharpnessDesaturateAndBlurEdges } from '../utils/images';
import { humanClick, humanReplace, jitteredWait } from '../utils/human';
import { wait } from '../utils/wait';
import { detectAdType } from './detect-ad-type';
import { solveCaptcha } from './solve-captcha';

export interface CarData extends Array<CarField> {
  imagePath?: string;
}

export interface CarDataResult {
  carData: CarData;
  /** Read from the edit page heading, not from the list the ad came from. */
  adType: AdType;
}

const randomPriceOffset = (): number => {
  const offset = Math.floor(Math.random() * 50) + 1;
  return Math.random() < 0.5 ? -offset : offset;
};

const randomRegistrationYear = (): string => {
  const currentYear = new Date().getFullYear();
  const minYear = currentYear - 20;
  return String(Math.floor(Math.random() * (currentYear - minYear + 1)) + minYear);
};

/**
 * Scrapes every field off an ad's edit form, then nudges the price and
 * registration year and re-submits.
 *
 * The nudge is deliberate: submitting the edit form with slightly different
 * values is what stops avto.net treating the replacement as a duplicate of
 * the ad we are about to delete.
 */
export const getCarData = async (
  page: Page,
  adId: string,
  hdImages: boolean,
  sourceType: AdType | undefined,
  testMode = false,
): Promise<CarDataResult> => {
  const userDataPath = app.getPath('userData');
  page.setDefaultTimeout(SLOW_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(SLOW_TIMEOUT_MS);

  const editUrl = `${AVTONET_EDIT_PREFIX}${adId}`;
  console.log('[getCarData] Start', { adId, sourceType, hdImages, editUrl, testMode });

  await page.goto(editUrl, { timeout: 0 });
  await page.waitForSelector('button[name=ADVIEW]', { timeout: 0 });
  await wait(3);

  // Resolve the type here, while nothing destructive has happened yet.
  const adType = await detectAdType(page, sourceType);

  const textAreas = await page.$$eval('textarea', (nodes) =>
    nodes.map((n) => ({ name: (n as HTMLTextAreaElement).name, value: (n as HTMLTextAreaElement).value })),
  );

  const checkboxes = await page.$$eval('input[type=checkbox]', (nodes) =>
    nodes.map((n) => {
      const input = n as HTMLInputElement;
      // Brand-compatibility boxes share a name, so keep the value in the key.
      const augmentedName =
        input.name === 'opombeznamka' && input.value ? `${input.name}|${input.value}` : input.name;
      return { name: augmentedName, value: input.checked ? '1' : '0' };
    }),
  );

  const selects = await page.$$eval('select', (nodes) =>
    nodes.map((n) => {
      const select = n as HTMLSelectElement;
      const opt = select.options[select.selectedIndex];
      return {
        name: select.name,
        value: select.value,
        selectedText: opt ? opt.textContent?.trim() ?? null : null,
      };
    }),
  );

  const inputs = await page.$$eval('input', (nodes) =>
    nodes.map((n) => ({ name: (n as HTMLInputElement).name, value: (n as HTMLInputElement).value })),
  );

  // Read the description from the textarea CKEditor binds to, rather than
  // assuming the first iframe on the page is the editor.
  const htmlOpis = textAreas.find((t) => t.name === 'opombe')?.value ?? null;

  const carData: CarData = [
    ...textAreas,
    ...checkboxes,
    ...selects.map(({ name, value }) => ({ name, value })),
    ...inputs,
    { name: 'htmlOpis', value: htmlOpis },
  ];

  // The new-ad page picks fuel by label, not by the edit page's numeric code.
  const gorivoSelect = selects.find((s) => s.name === 'gorivo');
  if (gorivoSelect?.selectedText) {
    carData.push({ name: 'gorivoText', value: gorivoSelect.selectedText });
  }

  if (testMode) {
    console.log('[getCarData] Test mode: skipping edit-form mutation and submit');
  } else {
    const priceField = inputs.find((i) => i.name === 'cena');
    if (priceField) {
      const originalPrice = parseInt(priceField.value, 10) || 1000;
      const newPrice = Math.max(100, originalPrice + randomPriceOffset());
      console.log('[getCarData] Adjusting price', { originalPrice, newPrice });
      await humanReplace(page, 'input[name="cena"]', String(newPrice));
    }

    const letoRegField = carData.find((d) => d.name === 'letoReg');
    if (letoRegField) {
      const newYear = randomRegistrationYear();
      console.log('[getCarData] Adjusting registration year', {
        originalYear: letoRegField.value,
        newYear,
      });
      await humanReplace(page, 'input[name="letoReg"]', newYear);
    }

    console.log('[getCarData] Submitting edit form');
    await jitteredWait(3);
    await solveCaptcha(page);
    await humanClick(page, 'button[name=ADVIEW]');
    await jitteredWait(3);
  }

  console.log('[getCarData] Navigating to images page');
  await page.goto(`${AVTONET_IMAGES_PREFIX}${adId}`, { timeout: 0 });
  await wait(3);

  const allImgSrcs = await page.$$eval('img', (imgs) => imgs.map((img) => (img as HTMLImageElement).src));
  let adImages = allImgSrcs.filter((src) => src.includes('images.avto.net'));

  if (adImages.length === 0) {
    // Bail out before anything destructive: without photos we would publish an
    // empty ad and have already deleted the original.
    const diag = await page.evaluate(() => ({
      title: document.title,
      bodyTextSnippet: (document.body?.innerText ?? '').slice(0, 400),
    }));
    console.log('[getCarData] Images-page diagnostics (no matches)', diag);
    throw new Error(
      `Za oglas ${adId} ni bilo mogoče najti nobene slike — obnova prekinjena pred brisanjem.`,
    );
  }

  adImages = adImages.map((img) => img.replace('_160', ''));
  if (hdImages) {
    adImages = adImages.map((img) => img.replace('.jpg', '_HD.jpg'));
  }

  carData.push({ name: 'images', value: adImages });

  const adImagesDirectory = getAdImagesDirectory(carData, userDataPath, adType);
  carData.imagePath = adImagesDirectory;

  if (!fs.existsSync(adImagesDirectory)) {
    console.log('[getCarData] Creating images directory', { path: adImagesDirectory });
    fs.mkdirSync(adImagesDirectory, { recursive: true });

    for (const [index, image] of adImages.entries()) {
      const target = path.join(adImagesDirectory, `${index}.jpg`);
      await downloadImage(image, target);
      // HD photos are uploaded untouched; standard ones are softened so the
      // replacement is not byte-identical to the ad it replaces.
      if (!hdImages && fs.existsSync(target)) {
        await reduceSharpnessDesaturateAndBlurEdges(target);
      }
    }
  } else {
    console.log('[getCarData] Images already downloaded', { path: adImagesDirectory });
  }

  console.log('[getCarData] Done', {
    fields: carData.length,
    imageCount: adImages.length,
    adType,
  });
  return { carData, adType };
};
