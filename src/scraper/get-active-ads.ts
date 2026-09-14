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

/**
 * The banner avto.net renders in place of the results list when a search
 * matches nothing ("Ni zadetkov").
 */
const NO_RESULTS_SELECTOR = '.alert.bg-danger';
const NO_RESULTS_TEXT = /ni\s+zadetkov/i;

const AD_TYPES = Object.keys(AVTONET_URLS) as AdType[];

/**
 * Waits for the results page to commit to having ads or not having any.
 *
 * Waiting on the row selector alone meant a category the broker has nothing in
 * cost a full DEFAULT_TIMEOUT_MS before the empty list could be reported — and
 * most brokers have no dostavna and no platišča, so that was two dead minutes
 * on every single refresh. The "Ni zadetkov" banner says the same thing
 * immediately, so whichever appears first ends the wait.
 *
 * Falling back to 'timeout' keeps the old behaviour if avto.net restyles the
 * banner: slow, but still correct.
 */
async function waitForResultsOutcome(page: Page): Promise<'rows' | 'empty' | 'timeout'> {
  const handle = await page
    .waitForFunction(
      (rowSelector: string, emptySelector: string, emptyText: string) => {
        if (document.querySelector(rowSelector)) return 'rows';

        const banner = document.querySelector(emptySelector);
        if (banner && new RegExp(emptyText, 'i').test(banner.textContent ?? '')) return 'empty';

        return null;
      },
      { timeout: DEFAULT_TIMEOUT_MS },
      RESULTS_ROW_SELECTOR,
      NO_RESULTS_SELECTOR,
      NO_RESULTS_TEXT.source,
    )
    .catch(() => null);

  if (!handle) return 'timeout';

  const outcome = await handle.jsonValue();
  await handle.dispose();
  return outcome === 'rows' ? 'rows' : 'empty';
}

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
    // A broker with no ads in this category is the normal case, not an error.
    const outcome = await waitForResultsOutcome(page);
    if (outcome !== 'rows') {
      console.log('[scrapeResultsList] No rows on this page', { adType, outcome });
      break;
    }

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
