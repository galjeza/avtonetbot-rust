import type { Page } from 'puppeteer-core';

import type { AdType } from '@shared/types';
import { newAdUrl, SLOW_TIMEOUT_MS } from '../constants';
import type { CarField } from '../utils/ad-images';
import { wait } from '../utils/wait';
import {
  fillCheckboxesFromData,
  fillInputsFromData,
  fillSelectsFromData,
  fillTextareasFromData,
  fillWysiwygOpis,
} from './fill-form-fields';
import { resolveModelValue, selectBrand, selectModel } from './select-brand-and-model';
import { setFuelType } from './set-fuel-type';
import { setRegistrationMonthYear } from './set-registration-values';
import { solveCaptcha } from './solve-captcha';

export const createNewAd = async (
  page: Page,
  carData: CarField[],
  adType: AdType,
): Promise<void> => {
  console.log('[createNewAd] Start', { adType, fields: carData.length });

  page.setDefaultTimeout(SLOW_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(SLOW_TIMEOUT_MS);
  await page.goto(newAdUrl(adType));

  // Wheels have no brand/model/registration step.
  if (adType !== 'platisca') {
    await page.waitForSelector('select[name=znamka]', { timeout: 0 });

    await selectBrand(page, carData, adType);
    await selectModel(page, resolveModelValue(carData, adType));

    const oblika = carData.find((d) => d.name === 'oblika');
    if (!oblika) throw new Error('Polja "oblika" ni bilo mogoče najti.');
    await page.select('select[name=oblika]', String(oblika.value));

    await setRegistrationMonthYear(page, carData);
    await setFuelType(page, carData);

    await page.click('button[name="potrdi"]');
    console.log('[createNewAd] Confirmed step 1');
    await wait(5);

    if (adType === 'car') {
      await page.waitForSelector('.supurl', { timeout: 0 });
      await page.click('.supurl');
    }
  }

  await page.waitForSelector('input[name="cena"], input[name="cenaEURO"]', {
    visible: true,
    timeout: SLOW_TIMEOUT_MS,
  });

  // The form arrives partially initialised; reloading settles it before we
  // start writing values into it.
  await page.reload();
  await page.waitForSelector('input[name="cena"], input[name="cenaEURO"]', {
    visible: true,
    timeout: SLOW_TIMEOUT_MS,
  });

  await fillWysiwygOpis(page, carData);
  await fillCheckboxesFromData(page, carData);
  await fillInputsFromData(page, carData);
  await fillSelectsFromData(page, carData);
  await fillTextareasFromData(page, carData);

  const vinObjaviField = carData.find((d) => d.name === 'VINobjavi');
  if (adType === 'car' && vinObjaviField) {
    const shouldBeChecked = vinObjaviField.value === '1';
    const isChecked = await page.$eval('#VINobjavi', (el) => (el as HTMLInputElement).checked);
    if (shouldBeChecked !== isChecked) {
      await page.click('#VINobjavi');
    }
  }

  await solveCaptcha(page);

  await Promise.all([
    page.waitForNavigation({ timeout: SLOW_TIMEOUT_MS }).catch(() => undefined),
    page.click('button[name="EDITAD"]'),
  ]);

  await page
    .waitForSelector('.mojtrg, .ButtonAddPhoto, input[type=file]', { timeout: 30 * 1000 })
    .catch(() => undefined);

  console.log('[createNewAd] Submitted new ad');
};
