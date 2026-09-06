import type { Page } from 'puppeteer-core';

import type { ActiveAd, AdType } from '@shared/types';

import { endSession, setupBrowser } from './browser';
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

const AD_TYPES = Object.keys(AVTONET_URLS) as AdType[];

/** Walks one results list, following "next page" until it runs out. */
async function scrapeResultsList(
  page: Page,
  brokerId: string,
  adType: AdType,
): Promise<ActiveAd[]> {
  await page.goto(`${AVTONET_URLS[adType]}${brokerId}`, {
    waitUntil: 'domcontentloaded',
  });

  const ads: ActiveAd[] = [];

  for (;;) {
    // A broker with no ads in this category never renders a row; treat that as
    // an empty list rather than an error.
    const hasRows = await page
      .waitForSelector(RESULTS_ROW_SELECTOR, { timeout: DEFAULT_TIMEOUT_MS })
      .then(() => true)
      .catch(() => false);

    if (!hasRows) break;

    // Thumbnails are lazy-loaded; wait until at least one real src appears so
    // the scraped photoUrl is not a data: placeholder.
    await page
      .waitForFunction(
        (selector: string) =>
          Array.from(document.querySelectorAll(`${selector} img`)).some(
            (img) => img.getAttribute('src') && !img.getAttribute('src')?.startsWith('data:'),
          ),
        { timeout: DEFAULT_TIMEOUT_MS },
        RESULTS_ROW_SELECTOR,
      )
      .catch(() => undefined);

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
      ads.push({
        ...ad,
        adId: ad.adUrl.split('=')[1] ?? '',
        sourceType: adType,
      });
    }

    const nextPageUrl = await page.evaluate((selector: string) => {
      const btn = document.querySelector(selector);
      if (!btn || btn.classList.contains('disabled')) return null;
      return btn.querySelector('a')?.href ?? null;
    }, NEXT_BUTTON_SELECTOR);

    if (!nextPageUrl) break;

    await page.goto(nextPageUrl, { waitUntil: 'domcontentloaded' });
  }

  return ads;
}

/**
 * Collects every renewable ad the broker has, across all categories, in a
 * single browser session. The category each ad came from is recorded, but the
 * renewal flow re-reads the real type from the ad's edit page.
 */
export async function fetchAllActiveAds(brokerId: string): Promise<ActiveAd[]> {
  const session = await setupBrowser();
  const { page } = session;

  try {
    const seen = new Set<string>();
    const all: ActiveAd[] = [];

    for (const adType of AD_TYPES) {
      const ads = await scrapeResultsList(page, brokerId, adType);
      console.log('[fetchAllActiveAds] Scraped list', {
        adType,
        count: ads.length,
      });

      for (const ad of ads) {
        if (!ad.adId || seen.has(ad.adId)) continue;
        seen.add(ad.adId);
        all.push(ad);
      }
    }

    console.log('[fetchAllActiveAds] Total', { count: all.length });
    return all;
  } finally {
    await endSession(session);
  }
}
