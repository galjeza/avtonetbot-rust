import type { Page } from 'puppeteer-core';

import type { AdType } from '@shared/types';

/**
 * The edit page announces what it is editing, e.g.
 *   <h1>Urejanje oglasa: Osebno vozilo</h1>
 *
 * That heading is the authority on an ad's type — the results list an ad was
 * scraped from is only a hint — so the renewal flow reads it here rather than
 * being told the type up front.
 */
const AD_TYPE_PATTERNS: Array<{ match: RegExp; adType: AdType }> = [
  { match: /osebno\s*vozilo/i, adType: 'car' },
  { match: /tovorno\s*vozilo|dostavno\s*vozilo|dostavn/i, adType: 'dostavna' },
  { match: /pnevmatik|platišč|platisc/i, adType: 'platisca' },
];

async function readEditHeading(page: Page): Promise<string> {
  return page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll('h1'));
    const target = headings.find((h) => /urejanje oglasa/i.test(h.textContent ?? ''));
    return (target ?? headings[0])?.textContent?.trim() ?? '';
  });
}

function adTypeFromHeading(heading: string): AdType | null {
  return AD_TYPE_PATTERNS.find((p) => p.match.test(heading))?.adType ?? null;
}

/**
 * Resolves the ad's type from the open edit page.
 *
 * Runs before anything destructive, so throwing here is safe: the original ad
 * is still intact. `fallback` is the list the ad came from, used only when the
 * heading is missing or unrecognised.
 */
export async function detectAdType(page: Page, fallback?: AdType): Promise<AdType> {
  const heading = await readEditHeading(page);
  const detected = adTypeFromHeading(heading);

  if (detected) {
    console.log('[detectAdType] Resolved from edit page', { heading, adType: detected });
    return detected;
  }

  if (fallback) {
    console.log('[detectAdType] Heading unrecognised, using results-list type', {
      heading,
      fallback,
    });
    return fallback;
  }

  throw new Error(
    `Vrste oglasa ni bilo mogoče določiti z naslova "${heading}". Obnova prekinjena.`,
  );
}
