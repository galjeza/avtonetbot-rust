import fs from 'node:fs';
import path from 'node:path';

import { app, BrowserWindow, ipcMain, shell } from 'electron';

import type {
  ActiveAd,
  AdType,
  BrowserStatus,
  OpenFolderResult,
  RenewProgress,
  UserData,
} from '@shared/types';
import { checkBrowserSession, reseedBotProfile } from '../scraper/browser';
import { fetchActiveAds } from '../scraper/get-active-ads';
import { renewAd } from '../scraper/renew-ad';
import { getUserData, setUserData, store } from './store';
import { initUpdater, isUpdateAvailable, simulateUpdateAvailable } from './updater';

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  });

  mainWindow.on('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // External links belong in the user's own browser, not in an app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

async function handleRenewAds(
  _event: Electron.IpcMainInvokeEvent,
  ads: ActiveAd[],
  pause: number,
  adType: AdType,
  testMode = false,
): Promise<string> {
  const userData = getUserData();
  if (!userData) throw new Error('Konfiguracija ni nastavljena.');

  const total = ads.length;
  const report = (progress: RenewProgress): void => {
    mainWindow?.webContents.send('renew-progress', progress);
  };

  for (const [index, ad] of ads.entries()) {
    try {
      report({ index, total, adId: ad.adId, step: 'začetek', status: 'running' });

      await renewAd({
        adId: ad.adId,
        email: userData.email,
        password: userData.password,
        hdImages: userData.hdImages ?? false,
        adType,
        testMode,
        onStep: (step) => report({ index, total, adId: ad.adId, step, status: 'running' }),
      });

      report({ index, total, adId: ad.adId, step: 'končano', status: 'done' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report({ index, total, adId: ad.adId, step: 'napaka', status: 'failed', message });
      throw error;
    }

    // Spacing renewals out is what keeps the batch from looking automated.
    const isLast = index === total - 1;
    if (!isLast && pause > 0) {
      report({ index, total, adId: ad.adId, step: `pavza ${pause} min`, status: 'waiting' });
      await new Promise((resolve) => setTimeout(resolve, pause * 60 * 1000));
    }
  }

  return 'renewed';
}

app.whenReady().then(() => {
  ipcMain.on('store-get', (event, key: string) => {
    event.returnValue = store.get(key as 'userData');
  });

  ipcMain.on('store-set', (event, key: string, value: unknown) => {
    store.set(key, value);
    event.returnValue = true;
  });

  ipcMain.handle('get-ads', async (_event, adType: AdType): Promise<ActiveAd[]> => {
    const userData = getUserData();
    if (!userData?.brokerId) {
      throw new Error('Manjka številka posrednika. Odprite konfiguracijo in shranite e-pošto.');
    }
    return fetchActiveAds(userData.brokerId, adType);
  });

  ipcMain.handle('renew-ads', handleRenewAds);

  ipcMain.handle('check-update-status', (): boolean => isUpdateAvailable());

  ipcMain.handle('check-browser-session', (): Promise<BrowserStatus> => checkBrowserSession());

  ipcMain.handle('reseed-browser-profile', async (): Promise<BrowserStatus> => {
    await reseedBotProfile();
    return checkBrowserSession();
  });

  ipcMain.handle('save-user-data', (_event, userData: UserData): boolean => {
    setUserData(userData);
    return true;
  });

  ipcMain.handle('open-ad-images-folder', async (): Promise<OpenFolderResult> => {
    const adImagesPath = path.join(app.getPath('userData'), 'AdImages');
    if (!fs.existsSync(adImagesPath)) {
      fs.mkdirSync(adImagesPath, { recursive: true });
    }
    const error = await shell.openPath(adImagesPath);
    return error ? { ok: false, error } : { ok: true };
  });

  if (isDev) {
    ipcMain.handle('dev-trigger-update', () => simulateUpdateAvailable());
  }

  createWindow();
  if (!isDev) initUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
