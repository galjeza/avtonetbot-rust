import { contextBridge, ipcRenderer } from 'electron';

import type { Api } from '@shared/api';
import type {
  ActiveAd,
  AdImageSet,
  AdPhoto,
  BrowserStatus,
  ChromeProfileInfo,
  OpenFolderResult,
  RenewProgress,
  UserData,
} from '@shared/types';

const api = {
  platform: process.platform,

  store: {
    get: (key: string): unknown => ipcRenderer.sendSync('store-get', key),
    set: (key: string, value: unknown): boolean => ipcRenderer.sendSync('store-set', key, value),
  },

  getAds: (): Promise<ActiveAd[]> => ipcRenderer.invoke('get-ads'),

  renewAds: (ads: ActiveAd[], pause: number, testMode: boolean): Promise<string> =>
    ipcRenderer.invoke('renew-ads', ads, pause, testMode),

  saveUserData: (userData: UserData): Promise<boolean> =>
    ipcRenderer.invoke('save-user-data', userData),

  getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),

  checkUpdateStatus: (): Promise<boolean> => ipcRenderer.invoke('check-update-status'),

  checkBrowserSession: (): Promise<BrowserStatus> => ipcRenderer.invoke('check-browser-session'),

  reseedBrowserProfile: (): Promise<BrowserStatus> => ipcRenderer.invoke('reseed-browser-profile'),

  signInManually: (): Promise<BrowserStatus> => ipcRenderer.invoke('sign-in-manually'),

  listChromeProfiles: (): Promise<ChromeProfileInfo[]> =>
    ipcRenderer.invoke('list-chrome-profiles'),

  selectChromeProfile: (profileDir: string): Promise<BrowserStatus> =>
    ipcRenderer.invoke('select-chrome-profile', profileDir),

  openAdImagesFolder: (): Promise<OpenFolderResult> => ipcRenderer.invoke('open-ad-images-folder'),

  openAdImageSetFolder: (dir: string): Promise<OpenFolderResult> =>
    ipcRenderer.invoke('open-ad-image-set-folder', dir),

  listAdImageSets: (): Promise<AdImageSet[]> => ipcRenderer.invoke('list-ad-image-sets'),

  readAdImages: (dir: string): Promise<AdPhoto[]> => ipcRenderer.invoke('read-ad-images', dir),

  applyAdImageOrder: (dir: string, order: string[]): Promise<AdPhoto[]> =>
    ipcRenderer.invoke('apply-ad-image-order', dir, order),

  replaceAdImage: (dir: string, file: string): Promise<AdPhoto[]> =>
    ipcRenderer.invoke('replace-ad-image', dir, file),

  addAdImages: (dir: string): Promise<AdPhoto[]> => ipcRenderer.invoke('add-ad-images', dir),

  /** Subscribes to batch progress; returns an unsubscribe function. */
  onRenewProgress: (callback: (progress: RenewProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: RenewProgress): void =>
      callback(progress);
    ipcRenderer.on('renew-progress', listener);
    return () => ipcRenderer.removeListener('renew-progress', listener);
  },
};

// `satisfies` makes the compiler prove this matches the shared contract,
// so the renderer's view of window.api can never drift from what we expose.
contextBridge.exposeInMainWorld('api', api satisfies Api);
