import type { Page } from 'puppeteer-core';

import type { AdType } from '@shared/types';
import { newAdUrl, SLOW_TIMEOUT_MS } from '../constants';
import { field, fieldValue, requireFieldValue, type CarField } from '../utils/car-fields';
import { humanClick, humanReplace, jitteredWait } from '../utils/human';
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

    await page.select('select[name=oblika]', requireFieldValue(carData, 'oblika', 'nov oglas'));

    await setRegistrationMonthYear(page, carData);
    await setFuelType(page, carData);

    await humanClick(page, 'button[name="potrdi"]');
    console.log('[createNewAd] Confirmed step 1');
    await jitteredWait(5);

    if (adType === 'car') {
      await page.waitForSelector('.supurl', { timeout: 0 });
      await humanClick(page, '.supurl');
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

  await fillCheckboxesFromData(page, carData);
  await fillInputsFromData(page, carData);
  await fillSelectsFromData(page, carData);
  await fillTextareasFromData(page, carData);

  // Written after the rest of the form rather than before it. Ticking a box
  // can re-render the page around the editor, and CKEditor keeps its own copy
  // of the text, so a description set first is the one thing here that another
  // step can quietly undo.
  await fillWysiwygOpis(page, carData);

  // "Zapiši šasijo na oglas". fillCheckboxesFromData has already had a go at
  // it; this re-reads the box afterwards because the VIN input is shown and
  // hidden by the same tick, so a click that silently misses leaves the
  // replacement publishing the opposite of what the original ad had.
  const vinObjaviField = field(carData, 'VINobjavi');
  if (adType === 'car' && vinObjaviField) {
    const shouldBeChecked = vinObjaviField.value === '1';

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const isChecked = await page
        .$eval('#VINobjavi', (el) => (el as HTMLInputElement).checked)
        .catch(() => null);

      console.log('[createNewAd] VINobjavi state', {
        attempt,
        scraped: vinObjaviField.value,
        shouldBeChecked,
        isChecked,
      });

      if (isChecked === null) {
        console.warn('[createNewAd] #VINobjavi not present on this form');
        break;
      }
      if (isChecked === shouldBeChecked) break;

      await humanClick(page, '#VINobjavi');
      await jitteredWait(1);
    }
  } else {
    console.warn('[createNewAd] No VINobjavi value scraped from the old ad', { adType });
  }

  // The VIN itself rides on that tick: avto.net ships the input readonly and
  // hides it while the box is off, so it can only be typed once the box above
  // is settled. fillInputsFromData ran before that and swallows a click on a
  // hidden field, which is why a VIN could go missing without any error.
  const vin = fieldValue(carData, 'VIN');
  if (adType === 'car' && vin) {
    const vinOnPage = await page
      .$eval('#VIN, input[name="VIN"]', (el) => (el as HTMLInputElement).value)
      .catch(() => null);

    if (vinOnPage === null) {
      console.warn('[createNewAd] VIN input not present, cannot write the VIN');
    } else if (vinOnPage.trim() !== vin.trim()) {
      console.log('[createNewAd] Writing the VIN', { onPage: vinOnPage, expected: vin });
      await humanReplace(page, '#VIN, input[name="VIN"]', vin);
    }
  }

  await solveCaptcha(page);

  await Promise.all([
    page.waitForNavigation({ timeout: SLOW_TIMEOUT_MS }).catch(() => undefined),
    humanClick(page, 'button[name="EDITAD"]'),
  ]);

  await page
    .waitForSelector('.mojtrg, .ButtonAddPhoto, input[type=file]', { timeout: 30 * 1000 })
    .catch(() => undefined);

  console.log('[createNewAd] Submitted new ad');
};
