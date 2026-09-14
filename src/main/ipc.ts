import fs from 'node:fs';

import { app, ipcMain, shell, type BrowserWindow } from 'electron';

import type {
  ActiveAd,
  AdImageSet,
  AdPhoto,
  BrowserStatus,
  ChromeProfileInfo,
  OpenFolderResult,
  UserData,
} from '@shared/types';
import {
  checkBrowserSession,
  listChromeProfiles,
  reseedBotProfile,
  selectChromeProfile,
  signInManually,
} from '../scraper/browser';
import { fetchAllActiveAds } from '../scraper/get-active-ads';
import {
  addAdImages,
  adImageSetPath,
  adImagesRoot,
  applyAdImageOrder,
  listAdImageSets,
  readAdImages,
  replaceAdImage,
} from './ad-images';
import { runRenewBatch } from './renew-batch';
import { getUserData, setUserData } from './store';
import { isUpdateAvailable } from './updater';

const openPath = async (target: string): Promise<OpenFolderResult> => {
  const error = await shell.openPath(target);
  return error ? { ok: false, error } : { ok: true };
};

/**
 * Wires every channel the preload script talks to.
 *
 * The window is passed as a getter rather than a value: handlers outlive any
 * particular window, and on macOS the app can be left running with none at
 * all and then open a fresh one.
 */
export function registerIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('get-user-data', (): UserData | undefined => getUserData());

  ipcMain.handle('save-user-data', (_event, userData: UserData): boolean => {
    setUserData(userData);
    return true;
  });

  ipcMain.handle('get-ads', async (): Promise<ActiveAd[]> => {
    const userData = getUserData();
    if (!userData?.brokerId) {
      throw new Error('Manjka številka posrednika. Odprite konfiguracijo in shranite e-pošto.');
    }
    return fetchAllActiveAds(userData.brokerId);
  });

  ipcMain.handle(
    'renew-ads',
    (_event, ads: ActiveAd[], pause: number, testMode = false): Promise<string> =>
      runRenewBatch(getWindow(), ads, pause, testMode),
  );

  ipcMain.handle('get-app-version', (): string => app.getVersion());
  ipcMain.handle('check-update-status', (): boolean => isUpdateAvailable());

  ipcMain.handle('check-browser-session', (): Promise<BrowserStatus> => checkBrowserSession());

  ipcMain.handle('reseed-browser-profile', async (): Promise<BrowserStatus> => {
    await reseedBotProfile();
    return checkBrowserSession();
  });

  ipcMain.handle('sign-in-manually', (): Promise<BrowserStatus> => signInManually());

  ipcMain.handle('list-chrome-profiles', (): ChromeProfileInfo[] => listChromeProfiles());

  ipcMain.handle(
    'select-chrome-profile',
    async (_event, profileDir: string): Promise<BrowserStatus> => {
      await selectChromeProfile(profileDir);
      return checkBrowserSession();
    },
  );

  ipcMain.handle('open-ad-images-folder', (): Promise<OpenFolderResult> => {
    const root = adImagesRoot();
    // Nothing has been downloaded yet on a fresh install, and opening the file
    // manager on a missing directory just fails.
    if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
    return openPath(root);
  });

  ipcMain.handle('open-ad-image-set-folder', (_event, dir: string): Promise<OpenFolderResult> =>
    openPath(adImageSetPath(dir)),
  );

  ipcMain.handle('list-ad-image-sets', (): AdImageSet[] => listAdImageSets());

  ipcMain.handle('read-ad-images', (_event, dir: string): AdPhoto[] => readAdImages(dir));

  ipcMain.handle('apply-ad-image-order', (_event, dir: string, order: string[]): AdPhoto[] =>
    applyAdImageOrder(dir, order),
  );

  ipcMain.handle('replace-ad-image', (_event, dir: string, file: string): Promise<AdPhoto[]> =>
    replaceAdImage(getWindow(), dir, file),
  );

  ipcMain.handle('add-ad-images', (_event, dir: string): Promise<AdPhoto[]> =>
    addAdImages(getWindow(), dir),
  );
}
