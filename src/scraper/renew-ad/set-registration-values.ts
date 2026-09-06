import type { Page } from 'puppeteer-core';

import type { CarField } from '../utils/ad-images';
import { wait } from '../utils/wait';

export const setRegistrationMonthYear = async (
  page: Page,
  carData: CarField[],
): Promise<void> => {
  console.log('[setRegistration] Selecting month');
  await page.select('select[name="mesec"]', '06');
  await wait(5);

  const regYear = carData.find((d) => d.name === 'letoReg')?.value;
  try {
    if (!regYear) throw new Error('letoReg missing');
    console.log('[setRegistration] Selecting year', { regYear });
    await page.select('select[name="leto"]', String(regYear));
  } catch {
    console.log('[setRegistration] Falling back to NOVO vozilo');
    await page.select('select[name="leto"]', 'NOVO vozilo');
  }
  await wait(3);
};
