import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';
import type { ElementHandle, Page } from 'puppeteer-core';

import type { AdType } from '@shared/types';
import { SLOW_TIMEOUT_MS } from '../constants';
import { getAdImagesDirectory } from '../utils/ad-images';
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

export const uploadImages = async (
  page: Page,
  carData: CarField[],
  adType: AdType,
): Promise<void> => {
  const userDataPath = app.getPath('userData');
  console.log('[uploadImages] Start', { adType, maxRetries: MAX_RETRIES });

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

      const imageFiles = fs
        .readdirSync(adImagesDirectory)
        .filter((file) => file.toLowerCase().endsWith('.jpg'))
        // Natural order, so 2.jpg precedes 10.jpg and the ad keeps its
        // original photo sequence.
        .sort((a, b) => {
          const numA = parseInt(a.match(/\d+/)?.[0] ?? '0', 10);
          const numB = parseInt(b.match(/\d+/)?.[0] ?? '0', 10);
          return numA - numB;
        });

      if (imageFiles.length === 0) {
        throw new Error(
          `V mapi ${adImagesDirectory} ni slik — oglas brez fotografij ne bo objavljen.`,
        );
      }

      console.log('[uploadImages] Files to upload', { count: imageFiles.length });

      for (const imageFile of imageFiles) {
        await wait(3);
        if (page.isClosed()) throw new Error('Stran za nalaganje slik se je zaprla.');

        const fileInput = await getFileInput(page);
        if (!fileInput) throw new Error('Polja za nalaganje datoteke ni bilo mogoče najti.');

        const imagePath = path.join(adImagesDirectory, imageFile);
        if (!fs.existsSync(imagePath)) continue;

        await fileInput.uploadFile(imagePath);
        await wait(4);

        const addPhotoButtons = await page.$$('.ButtonAddPhoto');
        if (addPhotoButtons.length > 0) {
          await addPhotoButtons[0].click().catch(() => undefined);
          await wait(4);
        }
      }

      console.log('[uploadImages] Upload complete');
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log('[uploadImages] Upload attempt failed', { error: message, retryCount });

      if (retryCount === MAX_RETRIES - 1) {
        throw new Error(`Nalaganje slik ni uspelo po ${MAX_RETRIES} poskusih: ${message}`);
      }
      await wait(5);
    }
  }
};
