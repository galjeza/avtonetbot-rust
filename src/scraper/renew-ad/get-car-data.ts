import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';
import type { Page } from 'puppeteer-core';

import type { AdType } from '@shared/types';
import { AVTONET_EDIT_PREFIX, AVTONET_IMAGES_PREFIX, SLOW_TIMEOUT_MS } from '../constants';
import { getAdImagesDirectory } from '../utils/ad-images';
import { field, type CarField } from '../utils/car-fields';
import { downloadImage, reduceSharpnessDesaturateAndBlurEdges } from '../utils/images';
import { humanClick, humanReplace, jitteredWait } from '../utils/human';
import { wait } from '../utils/wait';
import { detectAdType } from './detect-ad-type';
import { setWysiwygOpis } from './fill-form-fields';

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

const RANDOM_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** Noise appended to the old ad's description so its text stops matching. */
const randomSuffix = (length = 10): string =>
  Array.from({ length }, () => RANDOM_CHARS[Math.floor(Math.random() * RANDOM_CHARS.length)]).join(
    '',
  );

const randomRegistrationYear = (): string => {
  const currentYear = new Date().getFullYear();
  const minYear = currentYear - 20;
  return String(Math.floor(Math.random() * (currentYear - minYear + 1)) + minYear);
};

/** One field we changed and must find changed again after the save. */
interface Expectation {
  label: string;
  selector: string;
  expected: string;
  /** The description round-trips through CKEditor, so only the marker survives verbatim. */
  contains?: boolean;
}

/** Null for a field this ad type does not have, so nothing is expected of it. */
interface EditMutation {
  newPrice: string | null;
  newYear: string | null;
  htmlOpis: string | null;
  marker: string | null;
  markerSuffix: string | null;
}

/**
 * Types the anti-duplicate changes into the open edit form, solves the captcha
 * and submits, returning what each touched field must read back as.
 */
const applyEditMutation = async (page: Page, mutation: EditMutation): Promise<Expectation[]> => {
  const expectations: Expectation[] = [];

  if (mutation.newPrice !== null) {
    console.log('[getCarData] Adjusting price', { newPrice: mutation.newPrice });
    await humanReplace(page, 'input[name="cena"]', mutation.newPrice);
    expectations.push({
      label: 'cena',
      selector: 'input[name="cena"]',
      expected: mutation.newPrice,
    });
  }

  if (mutation.newYear !== null) {
    console.log('[getCarData] Adjusting registration year', { newYear: mutation.newYear });
    await humanReplace(page, 'input[name="letoReg"]', mutation.newYear);
    expectations.push({
      label: 'letoReg',
      selector: 'input[name="letoReg"]',
      expected: mutation.newYear,
    });
  }

  const vinObjavi = await page.$('#VINobjavi, input[name="VINobjavi"]');
  if (vinObjavi && (await vinObjavi.evaluate((el) => (el as HTMLInputElement).checked))) {
    console.log('[getCarData] Turning off "objavi VIN" on the old ad');
    await humanClick(page, '#VINobjavi, input[name="VINobjavi"]');
  }

  // Break the description's text similarity, and keep the real price and
  // registration year readable on the ad we are replacing.
  if (mutation.marker !== null && mutation.markerSuffix !== null && mutation.htmlOpis !== null) {
    console.log('[getCarData] Appending marker to description', { marker: mutation.marker });
    await setWysiwygOpis(page, `${mutation.htmlOpis}<p>${mutation.marker}</p>`);
    expectations.push({
      label: 'opis',
      selector: 'textarea[name="opombe"]',
      expected: mutation.markerSuffix,
      contains: true,
    });
  }

  console.log('[getCarData] Submitting edit form');
  await jitteredWait(3);
  // avto.net dropped the arithmetic captcha from this form. createNewAd still
  // calls solveCaptcha, which costs nothing while the field is absent.
  await Promise.all([
    page.waitForNavigation({ timeout: SLOW_TIMEOUT_MS }).catch(() => undefined),
    humanClick(page, 'button[name=ADVIEW]'),
  ]);
  await jitteredWait(3);

  return expectations;
};

/**
 * Reloads the edit form and reports which of our changes are missing.
 *
 * Clicking ADVIEW only proves a navigation happened. avto.net re-renders the
 * same edit page when it rejects a submission, which is indistinguishable from
 * a successful save until the values are read back.
 */
const findUnsavedFields = async (
  page: Page,
  editUrl: string,
  expectations: Expectation[],
): Promise<string[]> => {
  await page.goto(editUrl, { timeout: 0 });
  await page.waitForSelector('button[name=ADVIEW]', { timeout: 0 });
  await wait(3);

  const mismatches: string[] = [];
  for (const { label, selector, expected, contains } of expectations) {
    const actual = await page
      .$eval(selector, (el) => (el as HTMLInputElement | HTMLTextAreaElement).value)
      .catch(() => null);
    const saved =
      actual !== null && (contains ? actual.includes(expected) : actual.trim() === expected);
    if (!saved) {
      // Descriptions run to thousands of characters and this string ends up in
      // a dialog, so show only enough of the value to recognise it.
      const shown = actual === null ? '—' : actual.length > 60 ? `${actual.slice(0, 60)}…` : actual;
      mismatches.push(`${label} (pričakovano "${expected}", na strani "${shown}")`);
    }
  }

  return mismatches;
};

/**
 * Applies the edit and refuses to continue unless it actually landed.
 *
 * A silently rejected submit used to be invisible: the ad was deleted anyway
 * and recreated with its original VIN, which is exactly the duplicate avto.net
 * refuses. Throwing here costs nothing — deleteOldAd has not run yet.
 */
const submitEditAndVerify = async (
  page: Page,
  editUrl: string,
  mutation: EditMutation,
): Promise<void> => {
  const expectations = await applyEditMutation(page, mutation);
  const mismatches = await findUnsavedFields(page, editUrl, expectations);

  if (mismatches.length > 0) {
    console.warn('[getCarData] Edit did not save', { mismatches });
    throw new Error(
      `Sprememb na starem oglasu ni bilo mogoče shraniti (${mismatches.join('; ')}). ` +
        'Obnova je prekinjena, oglas ni bil izbrisan.',
    );
  }

  console.log('[getCarData] Edit saved and verified');
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
    nodes.map((n) => ({
      name: (n as HTMLTextAreaElement).name,
      value: (n as HTMLTextAreaElement).value,
    })),
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
        selectedText: opt ? (opt.textContent?.trim() ?? null) : null,
      };
    }),
  );

  const inputs = await page.$$eval('input', (nodes) =>
    nodes.map((n) => ({
      name: (n as HTMLInputElement).name,
      value: (n as HTMLInputElement).value,
    })),
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
    const letoRegField = field(carData, 'letoReg');

    // The marker suffix is generated up front so the read-back below has an
    // exact string to look for inside the saved description.
    const markerSuffix = htmlOpis !== null ? randomSuffix() : null;
    const marker =
      markerSuffix === null
        ? null
        : [markerSuffix, priceField?.value ?? '', String(letoRegField?.value ?? '')]
            .filter((part) => part !== '')
            .join(' ');

    await submitEditAndVerify(page, editUrl, {
      newPrice: priceField
        ? String(Math.max(100, (parseInt(priceField.value, 10) || 1000) + randomPriceOffset()))
        : null,
      newYear: letoRegField ? randomRegistrationYear() : null,
      htmlOpis,
      marker,
      markerSuffix,
    });
  }

  console.log('[getCarData] Navigating to images page');
  await page.goto(`${AVTONET_IMAGES_PREFIX}${adId}`, { timeout: 0 });
  await wait(3);

  const allImgSrcs = await page.$$eval('img', (imgs) =>
    imgs.map((img) => (img as HTMLImageElement).src),
  );
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
