import type { ActiveAd, AdType } from '@shared/types';

import { setupBrowser } from './browser';
import { AVTONET_URLS, DEFAULT_TIMEOUT_MS } from './constants';

const RESULTS_ROW_SELECTOR = '.GO-Results-Row';
const NEXT_BUTTON_SELECTOR = '.GO-Rounded-R';

const PRICE_SELECTORS = [
  '.GO-Results-Price-Mid',
  '.GO-Results-Price-Mid-Akcija',
  '.GO-Results-Price-TXT-Regular',
  '.GO-Results-Price-TXT-AkcijaCena',
  '.GO-Results-Price',
];

export async function fetchActiveAds(brokerId: string, adType: AdType): Promise<ActiveAd[]> {
  const url = `${AVTONET_URLS[adType]}${brokerId}`;
  const { page, release } = await setupBrowser();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const adData: ActiveAd[] = [];

    for (;;) {
      await page.waitForSelector(RESULTS_ROW_SELECTOR, { timeout: DEFAULT_TIMEOUT_MS });

      // Thumbnails are lazy-loaded; wait until at least one real src appears so
      // the scraped photoUrl is not a data: placeholder.
      await page.waitForFunction(
        (selector: string) =>
          Array.from(document.querySelectorAll(`${selector} img`)).some(
            (img) => img.getAttribute('src') && !img.getAttribute('src')?.startsWith('data:'),
          ),
        { timeout: DEFAULT_TIMEOUT_MS },
        RESULTS_ROW_SELECTOR,
      );

      // One round-trip for the whole page rather than per-row queries.
      const pageAds = await page.evaluate(
        (rowSelector: string, priceSelectors: string[]) => {
          const results: Array<{
            name: string;
            price: string;
            photoUrl: string;
            adUrl: string;
          }> = [];

          for (const row of Array.from(document.querySelectorAll(rowSelector))) {
            const photoEl = row.querySelector('.GO-Results-Photo');
            if (!photoEl) continue;

            const name =
              (row.querySelector('.GO-Results-Naziv') as HTMLElement | null)?.innerText.trim() ?? '';
            const photoUrl = photoEl.querySelector('img')?.getAttribute('src') ?? '';
            const adUrl = photoEl.querySelector('a')?.getAttribute('href') ?? '';
            if (!adUrl) continue;

            let price = '';
            for (const sel of priceSelectors) {
              const node = row.querySelector(sel) as HTMLElement | null;
              if (node?.innerText.trim()) {
                price = node.innerText.trim();
                break;
              }
            }

            // Sold ads cannot be renewed.
            if (!price || price === 'PRODANO') continue;

            results.push({ name, price, photoUrl, adUrl });
          }

          return results;
        },
        RESULTS_ROW_SELECTOR,
        PRICE_SELECTORS,
      );

      for (const ad of pageAds) {
        adData.push({ ...ad, adId: ad.adUrl.split('=')[1] ?? '' });
      }

      const nextPageUrl = await page.evaluate((selector: string) => {
        const btn = document.querySelector(selector);
        if (!btn || btn.classList.contains('disabled')) return null;
        return btn.querySelector('a')?.href ?? null;
      }, NEXT_BUTTON_SELECTOR);

      if (!nextPageUrl) break;

      await page.goto(nextPageUrl, { waitUntil: 'domcontentloaded' });
    }

    return adData;
  } finally {
    await release();
  }
}
