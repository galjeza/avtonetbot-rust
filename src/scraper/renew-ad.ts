import type { AdType } from '@shared/types';

import { isLoggedIn, setupBrowser, type BrowserSession } from './browser';
import { SLOW_TIMEOUT_MS } from './constants';
import { createNewAd } from './renew-ad/create-new-ad';
import { deleteOldAd } from './renew-ad/delete-old-ad';
import { getCarData } from './renew-ad/get-car-data';
import { loginToAvtonet } from './renew-ad/login-to-avtonet';
import { uploadImages } from './renew-ad/upload-images';

export interface RenewAdParams {
  adId: string;
  email: string;
  password: string;
  hdImages: boolean;
  adType: AdType;
  testMode?: boolean;
  onStep?: (step: string) => void;
}

/**
 * Opens a browser that is signed in to avto.net.
 *
 * The copied profile normally arrives already signed in, so this usually costs
 * one navigation. Typing credentials is the fallback for a lapsed session —
 * which is what the previous version did on every single ad.
 */
async function openSignedInSession(
  email: string,
  password: string,
  step: (name: string) => void,
): Promise<BrowserSession> {
  const session = await setupBrowser();
  try {
    step('preverjanje prijave');
    const { loggedIn } = await isLoggedIn(session.page);

    if (!loggedIn) {
      step('prijava');
      await loginToAvtonet(session.page, email, password);
    }

    return session;
  } catch (error) {
    await session.release().catch(() => undefined);
    throw error;
  }
}

/**
 * Renews one ad: scrape the edit form, delete the original, recreate it with
 * slightly different values, then re-upload the photos. The result surfaces as
 * a brand-new listing in search.
 */
export const renewAd = async ({
  adId,
  email,
  password,
  hdImages,
  adType,
  testMode = false,
  onStep,
}: RenewAdParams): Promise<void> => {
  const step = (name: string): void => {
    console.log('[RenewAd]', name, { adId });
    onStep?.(name);
  };

  console.log('[RenewAd] Start', { adId, adType, hdImages, testMode });
  const session = await openSignedInSession(email, password, step);
  const { page, release } = session;

  try {
    page.setDefaultTimeout(SLOW_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(SLOW_TIMEOUT_MS);

    step('branje oglasa');
    const carData = await getCarData(page, adId, hdImages, adType, testMode);

    if (testMode) {
      console.log('[RenewAd] Test mode: skipping deleteOldAd');
    } else {
      step('brisanje starega oglasa');
      await deleteOldAd(page, adId);
    }

    step('ustvarjanje novega oglasa');
    await createNewAd(page, carData, adType);

    step('nalaganje slik');
    await uploadImages(page, carData, adType);

    console.log('[RenewAd] Done', { adId });
  } finally {
    await release().catch(() => undefined);
  }
};
