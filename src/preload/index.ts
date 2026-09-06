import { contextBridge, ipcRenderer } from 'electron';

import type {
  ActiveAd,
  AdType,
  BrowserStatus,
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

  getAds: (adType: AdType): Promise<ActiveAd[]> => ipcRenderer.invoke('get-ads', adType),

  renewAds: (ads: ActiveAd[], pause: number, adType: AdType, testMode: boolean): Promise<string> =>
    ipcRenderer.invoke('renew-ads', ads, pause, adType, testMode),

  saveUserData: (userData: UserData): Promise<boolean> =>
    ipcRenderer.invoke('save-user-data', userData),

  checkUpdateStatus: (): Promise<boolean> => ipcRenderer.invoke('check-update-status'),

  checkBrowserSession: (): Promise<BrowserStatus> => ipcRenderer.invoke('check-browser-session'),

  reseedBrowserProfile: (): Promise<BrowserStatus> =>
    ipcRenderer.invoke('reseed-browser-profile'),

  openAdImagesFolder: (): Promise<OpenFolderResult> => ipcRenderer.invoke('open-ad-images-folder'),

  devTriggerUpdate: (): Promise<boolean> => ipcRenderer.invoke('dev-trigger-update'),

  /** Subscribes to batch progress; returns an unsubscribe function. */
  onRenewProgress: (callback: (progress: RenewProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: RenewProgress): void =>
      callback(progress);
    ipcRenderer.on('renew-progress', listener);
    return () => ipcRenderer.removeListener('renew-progress', listener);
  },
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
