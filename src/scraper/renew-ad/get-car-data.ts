import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';
import type { Page } from 'puppeteer-core';

import type { AdType } from '@shared/types';
import { AVTONET_EDIT_PREFIX, AVTONET_IMAGES_PREFIX, SLOW_TIMEOUT_MS } from '../constants';
import { getAdImagesDirectory, writeAdImagesMetadata } from '../utils/ad-images';
import { field, fieldValue, type CarField } from '../utils/car-fields';
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

/** Token written into the old ad's description so the read-back can find it. */
const randomSuffix = (length = 10): string =>
  Array.from({ length }, () => RANDOM_CHARS[Math.floor(Math.random() * RANDOM_CHARS.length)]).join(
    '',
  );

const randomRegistrationYear = (): string => {
  const currentYear = new Date().getFullYear();
  const minYear = currentYear - 20;
  return String(Math.floor(Math.random() * (currentYear - minYear + 1)) + minYear);
};

/** VIN characters. I, O and Q are excluded so they cannot be read as 1 and 0. */
const VIN_ALPHABET = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';

/** ISO 3779 letter values, used only to compute the check digit. */
const VIN_LETTER_VALUES: Record<string, number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  F: 6,
  G: 7,
  H: 8,
  J: 1,
  K: 2,
  L: 3,
  M: 4,
  N: 5,
  P: 7,
  R: 9,
  S: 2,
  T: 3,
  U: 4,
  V: 5,
  W: 6,
  X: 7,
  Y: 8,
  Z: 9,
};

const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

const randomVinChar = (): string => VIN_ALPHABET[Math.floor(Math.random() * VIN_ALPHABET.length)];

/**
 * The ISO 3779 check digit for a 17-character VIN.
 *
 * Position 9 carries weight 0, so whatever currently sits there does not
 * affect the result and the candidate can be passed in unmodified.
 */
function vinCheckDigit(vin: string): string {
  let sum = 0;
  for (let i = 0; i < 17; i += 1) {
    const char = vin[i];
    const value = /\d/.test(char) ? Number(char) : VIN_LETTER_VALUES[char];
    if (value === undefined) return '0';
    sum += value * VIN_WEIGHTS[i];
  }
  const remainder = sum % 11;
  return remainder === 10 ? 'X' : String(remainder);
}

/**
 * A different VIN for the ad we are about to delete.
 *
 * The VIN is the one field on a car that is unique by definition, so leaving
 * it untouched left the archived copy and its replacement sharing an exact
 * key. Unchecking "objavi VIN" only hides it from the public page; the value
 * stays in avto.net's database, which is where the matching happens.
 *
 * The first three characters (the manufacturer's WMI) are kept and the check
 * digit is recomputed, so the result is still a well-formed VIN for the same
 * make. A malformed one risks the form rejecting the whole submission — which
 * findUnsavedFields would catch, but as a blocked renewal rather than a fix.
 */
function randomVin(original: string): string {
  const clean = original.trim().toUpperCase();
  if (clean.length !== 17) {
    return Array.from({ length: clean.length || 17 }, randomVinChar).join('');
  }

  const wmi = /^[A-HJ-NPR-Z0-9]{3}$/.test(clean.slice(0, 3))
    ? clean.slice(0, 3)
    : Array.from({ length: 3 }, randomVinChar).join('');

  const candidate = wmi + Array.from({ length: 14 }, randomVinChar).join('');
  return `${candidate.slice(0, 8)}${vinCheckDigit(candidate)}${candidate.slice(9)}`;
}

/**
 * A mileage that still reads as this car's, but far enough off to stop the two
 * ads matching on brand + model + year + km.
 *
 * Five to fifteen per cent, rounded the way an odometer reading is written.
 *
 * @returns null when the ad has no usable mileage to work from.
 */
function randomMileage(original: string): string | null {
  const km = parseInt(original.replace(/\D/g, ''), 10);
  if (!Number.isFinite(km) || km <= 0) return null;

  const delta = Math.max(1000, Math.round(km * (0.05 + Math.random() * 0.1)));
  const shifted = km + (Math.random() < 0.5 ? -delta : delta);
  const rounded = Math.max(1000, Math.round(shifted / 1000) * 1000);

  return String(rounded === km ? km + 1000 : rounded);
}

/**
 * The VIN input, which the form ships readonly and unseals on focus
 * (`onfocus="this.removeAttribute('readonly')"`). Clicking it — which
 * humanReplace does before typing — is what makes it writable.
 */
const VIN_SELECTOR = '#VIN, input[name="VIN"]';

/** Values kept on the archived ad, in the order someone rebuilding it would read them. */
const ARCHIVE_FIELDS: Array<[name: string, label: string]> = [
  ['znamkavozila', 'Znamka'],
  ['modelvozila', 'Model'],
  ['tipvozila', 'Tip'],
  ['letoReg', 'Leto registracije'],
  ['prevozenikm', 'Prevoženi km'],
  ['cena', 'Cena'],
  ['oblika', 'Oblika'],
  ['gorivoText', 'Gorivo'],
  ['VIN', 'VIN'],
];

const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * What replaces the old ad's description.
 *
 * Two jobs at once. It removes the original text, which is what made the
 * archived copy read as the same ad — the old marker only appended a dozen
 * characters to a description running to thousands, so the two still matched
 * almost exactly. And it leaves the ad's real values written down on avto.net
 * itself, which is the one place they are not otherwise recoverable if the
 * replacement ad fails to publish.
 *
 * The original description is deliberately not among them: reprinting it here
 * would put the similarity straight back. It goes to the local snapshot
 * instead, which avto.net never sees.
 */
function buildArchiveNote(adId: string, carData: CarField[], marker: string): string {
  const rows = ARCHIVE_FIELDS.map(([name, label]) => {
    const value = fieldValue(carData, name);
    return value ? `${label}: ${escapeHtml(value)}` : null;
  }).filter((row): row is string => row !== null);

  return [
    `<p>${marker}</p>`,
    `<p>Izvirni podatki oglasa ${escapeHtml(adId)} pred obnovo:</p>`,
    `<p>${rows.join('<br>')}</p>`,
  ].join('');
}

/**
 * Writes the ad exactly as it was scraped, before anything is changed.
 *
 * Kept outside AdImages on purpose: that directory's existence is what decides
 * whether the photos still need downloading, so creating it early would skip
 * the download.
 */
function writeOriginalAdSnapshot(adId: string, adType: AdType, carData: CarField[]): void {
  try {
    const dir = path.join(app.getPath('userData'), 'AdBackups');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `${adId}.json`),
      JSON.stringify({ adId, adType, savedAt: new Date().toISOString(), fields: carData }, null, 2),
    );
  } catch (error) {
    // A missing snapshot must not stop a renewal that is otherwise fine.
    console.warn('[getCarData] Could not write the original-ad snapshot', error);
  }
}

/** One field we changed and must find changed again after the save. */
interface Expectation {
  label: string;
  selector: string;
  expected: string;
  /** The description round-trips through CKEditor, so only the marker survives verbatim. */
  contains?: boolean;
  /**
   * Compare digits only. Number fields come back formatted ("163.000"), and an
   * exact comparison would report a saved value as unsaved.
   */
  digits?: boolean;
  /**
   * A field missing on reload is not a failed save. The VIN input is not
   * rendered on every ad type, and disappears from some forms once "objavi
   * VIN" is off — neither of which says anything about what we typed.
   */
  optional?: boolean;
}

/** Null for a field this ad type does not have, so nothing is expected of it. */
interface EditMutation {
  newPrice: string | null;
  newYear: string | null;
  newKm: string | null;
  /** Replacement VIN; null when the ad has no VIN to replace. */
  newVin: string | null;
  /** Replaces the description outright; null when the ad has no description. */
  archiveNote: string | null;
  /** Token that has to show up in the saved description. */
  archiveMarker: string | null;
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

  if (mutation.newKm !== null) {
    console.log('[getCarData] Adjusting mileage', { newKm: mutation.newKm });
    await humanReplace(page, 'input[name="prevozenikm"]', mutation.newKm);
    expectations.push({
      label: 'prevozenikm',
      selector: 'input[name="prevozenikm"]',
      expected: mutation.newKm,
      digits: true,
    });
  }

  if (mutation.newVin !== null) {
    console.log('[getCarData] Replacing the VIN on the old ad');
    await humanReplace(page, VIN_SELECTOR, mutation.newVin);
    expectations.push({
      label: 'VIN',
      selector: VIN_SELECTOR,
      expected: mutation.newVin,
      optional: true,
    });
  }

  const vinObjavi = await page.$('#VINobjavi, input[name="VINobjavi"]');
  if (vinObjavi && (await vinObjavi.evaluate((el) => (el as HTMLInputElement).checked))) {
    console.log('[getCarData] Turning off "objavi VIN" on the old ad');
    await humanClick(page, '#VINobjavi, input[name="VINobjavi"]');
  }

  // Replaced, not extended. Appending left the original text in place, so the
  // archived copy still read as the same ad as the one built from it.
  if (mutation.archiveNote !== null && mutation.archiveMarker !== null) {
    console.log('[getCarData] Replacing the description with the original values');
    await setWysiwygOpis(page, mutation.archiveNote);
    expectations.push({
      label: 'opis',
      selector: 'textarea[name="opombe"]',
      expected: mutation.archiveMarker,
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

  const digitsOf = (value: string): string => value.replace(/\D/g, '');

  const mismatches: string[] = [];
  for (const { label, selector, expected, contains, digits, optional } of expectations) {
    const actual = await page
      .$eval(selector, (el) => (el as HTMLInputElement | HTMLTextAreaElement).value)
      .catch(() => null);

    if (actual === null && optional) {
      console.log('[getCarData] Optional field absent on reload, not checking it', { label });
      continue;
    }

    const matches = (value: string): boolean => {
      if (digits) return digitsOf(value) === digitsOf(expected);
      if (contains) return value.includes(expected);
      return value.trim() === expected;
    };
    const saved = actual !== null && matches(actual);
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
 * Scrapes every field off an ad's edit form, then rewrites the parts of it
 * that identify the car and re-submits.
 *
 * The rewrite is deliberate, and it is applied to the ad we are about to
 * delete rather than to its replacement: the new ad has to stay accurate for
 * buyers, while the archived copy only has to stop looking like it. Price,
 * registration year, mileage, VIN and description all move, because avto.net
 * matches an incoming ad against the archive and offers to restore the old one
 * instead of publishing.
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
    const kmValue = fieldValue(carData, 'prevozenikm');
    const vinValue = fieldValue(carData, 'VIN');

    // Written before anything on the page is touched, so there is a complete
    // copy of the ad — description included — even if the edit below is
    // rejected halfway or the replacement never publishes.
    writeOriginalAdSnapshot(adId, adType, carData);

    // Generated up front so the read-back has an exact string to look for
    // inside the saved description.
    const archiveMarker = htmlOpis !== null ? `ARHIV-${adId}-${randomSuffix()}` : null;

    await submitEditAndVerify(page, editUrl, {
      newPrice: priceField
        ? String(Math.max(100, (parseInt(priceField.value, 10) || 1000) + randomPriceOffset()))
        : null,
      newYear: letoRegField ? randomRegistrationYear() : null,
      newKm: kmValue ? randomMileage(kmValue) : null,
      newVin: vinValue ? randomVin(vinValue) : null,
      archiveNote: archiveMarker === null ? null : buildArchiveNote(adId, carData, archiveMarker),
      archiveMarker,
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

  // Written every time, not just on download, so sets saved by earlier
  // versions pick up a proper name the next time their ad is renewed. The
  // values are read at the same point the directory name was built from them,
  // so the label always matches the directory it sits in.
  writeAdImagesMetadata(adImagesDirectory, {
    adId,
    adType,
    brand: fieldValue(carData, 'znamkavozila'),
    model: fieldValue(carData, 'modelvozila'),
    year: fieldValue(carData, 'letoReg'),
    km: fieldValue(carData, 'prevozenikm'),
    savedAt: new Date().toISOString(),
  });

  console.log('[getCarData] Done', {
    fields: carData.length,
    imageCount: adImages.length,
    adType,
  });
  return { carData, adType };
};
