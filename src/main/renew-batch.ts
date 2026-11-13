import { powerSaveBlocker, type BrowserWindow } from 'electron';

import type { ActiveAd, RenewProgress } from '@shared/types';
import { closeBrowser } from '../scraper/browser';
import { renewAd } from '../scraper/renew-ad';
import { waitMs } from '../scraper/utils/wait';
import { getUserData } from './store';

/**
 * Runs a batch of renewals, reporting each step to the window as it goes.
 *
 * The pause between ads is the point of the whole shape: renewals arriving in
 * an even rhythm are what makes a run look automated, and a batch left to
 * sprint through twenty ads would do exactly that. It is skipped after the
 * last ad, since there is nothing left to space out.
 *
 * One failed ad stops the batch. A renewal that fails partway can have deleted
 * the original without publishing its replacement, and carrying on into the
 * next ad would bury that under the ones after it.
 */
export async function runRenewBatch(
  window: BrowserWindow | null,
  ads: ActiveAd[],
  pauseMinutes: number,
  testMode = false,
): Promise<string> {
  const userData = getUserData();
  if (!userData) throw new Error('Konfiguracija ni nastavljena.');

  // The pauses make a batch outlast the idle-sleep timer of an unattended PC,
  // and a sleep that lands between the delete and the photo upload leaves an
  // ad half-made. The screen may still turn off; only suspension is blocked.
  const stayAwake = powerSaveBlocker.start('prevent-app-suspension');

  const total = ads.length;
  const report = (progress: RenewProgress): void => {
    window?.webContents.send('renew-progress', progress);
  };

  try {
    for (const [index, ad] of ads.entries()) {
      const at = (step: string, rest: Partial<RenewProgress> = {}): RenewProgress => ({
        index,
        total,
        adId: ad.adId,
        step,
        status: 'running',
        ...rest,
      });

      try {
        report(at('začetek'));

        await renewAd({
          ad,
          email: userData.email,
          password: userData.password,
          hdImages: userData.hdImages ?? false,
          testMode,
          onStep: (step, adType) => report(at(step, { adType })),
        });

        report(at('končano', { status: 'done' }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        report(at('napaka', { status: 'failed', message }));
        throw error;
      }

      const isLast = index === total - 1;
      if (!isLast && pauseMinutes > 0) {
        report(at(`pavza ${pauseMinutes} min`, { status: 'waiting' }));
        await waitMs(pauseMinutes * 60 * 1000);
      }
    }

    return 'renewed';
  } finally {
    // Nothing reuses the browser once the batch ends, successfully or not.
    powerSaveBlocker.stop(stayAwake);
    await closeBrowser().catch(() => undefined);
  }
}
