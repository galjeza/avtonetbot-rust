import type { Page } from 'puppeteer-core';

import { AVTONET_DELETE_PREFIX } from '../constants';

export const deleteOldAd = async (page: Page, adId: string): Promise<void> => {
  console.log('[deleteOldAd] Navigating to delete URL', { adId });
  await page.goto(`${AVTONET_DELETE_PREFIX}${adId}`, { timeout: 0 });
  console.log('[deleteOldAd] Delete request sent');
};
