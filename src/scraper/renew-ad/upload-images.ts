import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';
import type { ElementHandle, Page } from 'puppeteer-core';

import type { AdType } from '@shared/types';
import { AVTONET_IMAGES_PREFIX, SLOW_TIMEOUT_MS } from '../constants';
import { getAdImagesDirectory, photoFiles } from '../utils/ad-images';
import { jitteredWait } from '../utils/human';
import type { CarField } from '../utils/car-fields';
import { wait } from '../utils/wait';

const MAX_RETRIES = 3;
const UPLOAD_SELECTORS = ['.mojtrg', '.ButtonAddPhoto', 'input[type=file]'];

/**
 * The file input only exists after the "add photo" button is clicked, and the
 * page re-renders between uploads, so it has to be re-found every time.
 */
const getFileInput = async (page: Page): Promise<ElementHandle<HTMLInputElement> | null> => {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const fileInput = await page.$('input[type=file]');
    if (fileInput) return fileInput as ElementHandle<HTMLInputElement>;

    const addPhotoButton = await page.$('.ButtonAddPhoto');
    if (addPhotoButton) {
      await addPhotoButton.click().catch(() => undefined);
    }
    await wait(2);
  }
  return null;
};

const UPLOAD_SETTLE_TIMEOUT_MS = 60 * 1000;

/**
 * Returns a wait for whatever the last action sent to finish.
 *
 * The step used to wait a flat four seconds per photo and call it uploaded.
 * A large file, a slow line or a throttled tab takes longer than that, and the
 * next action then cut the upload off — an ad short of photos with no error.
 * Network silence is used rather than a thumbnail appearing because it holds
 * however avto.net chooses to render the result.
 *
 * It gives up for the rest of the ad after one timeout: a page that keeps a
 * request open (ads, polling) never goes idle, and paying the full timeout on
 * every photo would stretch one ad's upload past an hour.
 */
const createUploadSettler = (page: Page): (() => Promise<void>) => {
  let usable = true;
  return async () => {
    if (!usable) return;
    try {
      await page.waitForNetworkIdle({ idleTime: 2000, timeout: UPLOAD_SETTLE_TIMEOUT_MS });
    } catch {
      usable = false;
      console.warn('[uploadImages] Network never went idle, falling back to fixed waits');
    }
  };
};

/** Same test getCarData uses to list an ad's photos before renewing it. */
const countPhotosOnPage = (page: Page): Promise<number> =>
  page.$$eval(
    'img',
    (imgs) =>
      imgs.filter((img) => (img as HTMLImageElement).src.includes('images.avto.net')).length,
  );

/**
 * Counts the photos the new ad really has, or null when that cannot be told.
 *
 * The count is only trusted on the ad's photo-edit page, where the same test
 * is already what a renewal relies on. Anywhere else a zero could just mean
 * the page shows its photos differently, and failing a good renewal on a guess
 * would be worse than not checking.
 */
const countPublishedPhotos = async (page: Page, expected: number): Promise<number | null> => {
  const onPage = await countPhotosOnPage(page).catch(() => 0);
  if (onPage >= expected) return onPage;

  const photosPagePath = new URL(AVTONET_IMAGES_PREFIX).pathname.toLowerCase();
  const current = new URL(page.url());
  const newAdId = current.searchParams.get('id');
  if (current.pathname.toLowerCase() !== photosPagePath || !newAdId) return null;

  // avto.net can take a moment to process the last photos, so ask a few times.
  let count = onPage;
  for (let attempt = 0; attempt < 3 && count < expected; attempt += 1) {
    await page.goto(`${AVTONET_IMAGES_PREFIX}${newAdId}`, { timeout: 0 });
    await wait(5);
    count = await countPhotosOnPage(page).catch(() => count);
  }
  return count;
};

export const uploadImages = async (
  page: Page,
  carData: CarField[],
  adType: AdType,
): Promise<void> => {
  const userDataPath = app.getPath('userData');
  console.log('[uploadImages] Start', { adType, maxRetries: MAX_RETRIES });
  let expectedPhotos = 0;

  for (let retryCount = 0; retryCount < MAX_RETRIES; retryCount += 1) {
    try {
      page.setDefaultTimeout(SLOW_TIMEOUT_MS);
      page.setDefaultNavigationTimeout(SLOW_TIMEOUT_MS);

      await page
        .waitForSelector(UPLOAD_SELECTORS.join(', '), { timeout: SLOW_TIMEOUT_MS })
        .catch(() => undefined);

      let foundSelector = false;
      for (const selector of UPLOAD_SELECTORS) {
        if (await page.$(selector)) {
          foundSelector = true;
          break;
        }
      }
      if (!foundSelector) throw new Error('Nismo na strani za nalaganje slik.');

      await jitteredWait(2.5, 0.2);

      const infoIcon = await page.$('.fa.fa-info-circle.fa-lg');
      if (infoIcon) {
        await infoIcon.click().catch(() => undefined);
        await wait(2);
      }

      const adImagesDirectory = getAdImagesDirectory(carData, userDataPath, adType);

      const imageFiles = photoFiles(adImagesDirectory);

      if (imageFiles.length === 0) {
        throw new Error(
          `V mapi ${adImagesDirectory} ni slik — oglas brez fotografij ne bo objavljen.`,
        );
      }

      console.log('[uploadImages] Files to upload', { count: imageFiles.length });

      const settle = createUploadSettler(page);
      for (const imageFile of imageFiles) {
        await wait(3);
        if (page.isClosed()) throw new Error('Stran za nalaganje slik se je zaprla.');

        const fileInput = await getFileInput(page);
        if (!fileInput) throw new Error('Polja za nalaganje datoteke ni bilo mogoče najti.');

        const imagePath = path.join(adImagesDirectory, imageFile);
        if (!fs.existsSync(imagePath)) continue;

        await fileInput.uploadFile(imagePath);
        await wait(4);
        await settle();

        const addPhotoButtons = await page.$$('.ButtonAddPhoto');
        if (addPhotoButtons.length > 0) {
          await addPhotoButtons[0].click().catch(() => undefined);
          await wait(4);
          await settle();
        }
      }

      expectedPhotos = imageFiles.length;
      console.log('[uploadImages] Upload complete');
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log('[uploadImages] Upload attempt failed', { error: message, retryCount });

      if (retryCount === MAX_RETRIES - 1) {
        throw new Error(`Nalaganje slik ni uspelo po ${MAX_RETRIES} poskusih: ${message}`);
      }
      await wait(5);
    }
  }

  // Outside the retry loop on purpose: a retry uploads the whole set again,
  // which would turn a shortfall into duplicates.
  const published = await countPublishedPhotos(page, expectedPhotos).catch(() => null);
  console.log('[uploadImages] Verification', { expected: expectedPhotos, published });

  if (published === null) {
    console.warn('[uploadImages] Could not verify the photo count on this page', {
      url: page.url(),
    });
  } else if (published < expectedPhotos) {
    throw new Error(
      `Novi oglas je objavljen, vendar ima samo ${published} od ${expectedPhotos} slik. ` +
        'Odprite oglas na avto.net in manjkajoče slike dodajte ročno.',
    );
  }
};
