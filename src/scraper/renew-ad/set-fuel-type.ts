import type { Page } from 'puppeteer-core';

import type { CarField } from '../utils/ad-images';

/**
 * Maps the fuel label scraped from the edit page onto the new-ad page's radio
 * id. The two pages disagree on vocabulary, hence the patterns.
 */
const TEXT_TO_RADIO_ID: Array<{ match: RegExp; id: string }> = [
  { match: /diesel|dizel/i, id: 'diesel' },
  { match: /bencin|gasoline|petrol/i, id: 'bencin' },
  { match: /hibrid/i, id: 'hibrid' },
  { match: /e-?pogon|elektro|electric/i, id: 'epogon' },
  { match: /lpg|avtoplin/i, id: 'LPG' },
  { match: /cng|zemeljski/i, id: 'CNG' },
];

const resolveRadioId = (text: string | null | undefined): string | null => {
  if (!text) return null;
  return TEXT_TO_RADIO_ID.find((m) => m.match.test(text))?.id ?? null;
};

export const setFuelType = async (page: Page, carData: CarField[]): Promise<void> => {
  const gorivoText = carData.find((d) => d.name === 'gorivoText');
  const fromText = resolveRadioId(gorivoText?.value as string | undefined);

  console.log('[setFuelType] Selecting fuel type', {
    gorivoText: gorivoText?.value ?? null,
    resolvedRadioId: fromText,
  });

  if (!fromText) {
    // Dump the available radios so the mapping can be extended when avto.net
    // introduces a fuel type we do not know about.
    const dom = await page.evaluate(() =>
      Array.from(document.querySelectorAll('input[name="gorivo"]')).map((el) => ({
        id: (el as HTMLInputElement).id,
        value: (el as HTMLInputElement).value,
        labelText: (el as HTMLInputElement).labels?.[0]?.textContent?.trim() ?? null,
      })),
    );
    console.log('[setFuelType] No match for scraped gorivo text. Page radios:', dom);
    throw new Error(
      `Vrste goriva "${String(gorivoText?.value)}" ni bilo mogoče preslikati na izbiro na strani.`,
    );
  }

  await page.click(`#${fromText}`);
};
