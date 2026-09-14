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
  const znamkaData =
    field(carData, 'znamka') ?? (adType === 'dostavna' ? field(carData, 'znamkaTEMP') : undefined);
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
  const modelOptions = await page.$$eval('select[name=model] option', (options) =>
    options.map((option) => {
      const opt = option as HTMLOptionElement;
      return {
        value: opt.value,
        // Sub-models are indented with &nbsp;, which trim() does not remove.
        label: (opt.textContent ?? '').replace(/ /g, ' ').trim(),
        // The "A4 (vsi)" rows are disabled group headings, not selectable.
        disabled: opt.disabled,
      };
    }),
  );

  const requestedModel = String(carModel || '').trim();
  const selectable = modelOptions.filter((o) => !o.disabled && o.value !== '');

  // Model values are inconsistent across pages: sometimes spaced, sometimes
  // dash-joined, sometimes punctuated differently. Try progressively looser
  // matches rather than failing on a cosmetic difference.
  const directMatch = selectable.find((o) => o.value === requestedModel);
  const dashedMatch = selectable.find((o) => o.value === requestedModel.replaceAll(' ', '---'));
  const normalizedRequested = normalizeModelValue(requestedModel);
  const normalizedMatch = selectable.find(
    (o) => normalizeModelValue(o.value) === normalizedRequested && !o.value.includes('(vsi)'),
  );

  // Last resort, and the only thing that finds an Audi A4: where a model name
  // would collide across brands, avto.net prefixes the *value* with the brand
  // ("AudiA4", "AudiCoupe", "Audie-tron") while leaving the label alone. No
  // amount of normalising turns "a4" into "audia4", so match on what the
  // option displays instead.
  const labelMatch = selectable.find((o) => normalizeModelValue(o.label) === normalizedRequested);

  const selected = directMatch || dashedMatch || normalizedMatch || labelMatch;
  if (!selected) {
    throw new Error(`Modela "${requestedModel}" ni bilo mogoče najti med možnostmi.`);
  }
  const selectedModel = selected.value;

  console.log('[selectModel] Selected model value:', selectedModel);
  await page.select('select[name=model]', selectedModel);
  await wait(3);
};
