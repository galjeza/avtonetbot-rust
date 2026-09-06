import type { Page } from 'puppeteer-core';

import type { AdType } from '@shared/types';
import { field, fieldValue, requireFieldValue, type CarField } from '../utils/car-fields';
import { wait } from '../utils/wait';

export const selectBrand = async (
  page: Page,
  carData: CarField[],
  adType: AdType,
): Promise<void> => {
  const znamkaOptionsValues = await page.$$eval('select[name=znamka] option', (options) =>
    options.map((option) => (option as HTMLOptionElement).value),
  );

  // Delivery vehicles carry the brand in a different field.
  const znamkaData = field(carData, 'znamka') ?? (adType === 'dostavna' ? field(carData, 'znamkaTEMP') : undefined);
  if (!znamkaData) {
    throw new Error(`Polja "znamka" ni bilo mogoče najti za vrsto oglasa: ${adType}`);
  }

  const value = String(znamkaData.value);
  console.log('[selectBrand] Selecting brand', { value });

  // The new-ad page sometimes lists brands without spaces ("LandRover").
  if (!znamkaOptionsValues.includes(value)) {
    await page.select('select[name=znamka]', value.replaceAll(' ', ''));
  } else {
    await page.select('select[name=znamka]', value);
  }

  await wait(3);
};

export const resolveModelValue = (carData: CarField[], adType: AdType): string => {
  if (adType === 'dostavna') {
    const model = fieldValue(carData, 'modelTEMP') ?? fieldValue(carData, 'model');
    if (model) return model;
    throw new Error('Za dostavno vozilo ni bilo mogoče najti polja modelTEMP ali model.');
  }

  return requireFieldValue(carData, 'model', 'nov oglas');
};

const normalizeModelValue = (value: string): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\(vsi\)/g, '')
    .replace(/[^a-z0-9]/g, '');

export const selectModel = async (page: Page, carModel: string): Promise<void> => {
  const modelOptionsValues = await page.$$eval('select[name=model] option', (options) =>
    options.map((option) => (option as HTMLOptionElement).value),
  );

  const requestedModel = String(carModel || '').trim();

  // Model values are inconsistent across pages: sometimes spaced, sometimes
  // dash-joined, sometimes punctuated differently. Try progressively looser
  // matches rather than failing on a cosmetic difference.
  const directMatch = modelOptionsValues.find((v) => v === requestedModel);
  const dashedMatch = modelOptionsValues.find((v) => v === requestedModel.replaceAll(' ', '---'));
  const normalizedRequested = normalizeModelValue(requestedModel);
  const normalizedMatch = modelOptionsValues.find(
    (v) => normalizeModelValue(v) === normalizedRequested && !v.includes('(vsi)'),
  );

  const selectedModel = directMatch || dashedMatch || normalizedMatch;
  if (!selectedModel) {
    throw new Error(`Modela "${requestedModel}" ni bilo mogoče najti med možnostmi.`);
  }

  console.log('[selectModel] Selected model value:', selectedModel);
  await page.select('select[name=model]', selectedModel);
  await wait(3);
};
