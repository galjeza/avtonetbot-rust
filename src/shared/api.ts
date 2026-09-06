import type {
  ActiveAd,
  BrowserStatus,
  OpenFolderResult,
  RenewProgress,
  UserData,
} from './types';

/**
 * The surface the preload script exposes on `window.api`.
 *
 * Declared here rather than derived from the preload module with `typeof` so
 * the renderer never has to import preload — which would pull Electron's (and
 * therefore Node's) types into the browser-side program and let main-process
 * globals leak into React code. The preload implementation is checked against
 * this with `satisfies`, so the two cannot drift.
 */
export interface Api {
  platform: string;

  store: {
    get(key: string): unknown;
    set(key: string, value: unknown): boolean;
  };

  getAds(): Promise<ActiveAd[]>;
  renewAds(ads: ActiveAd[], pause: number, testMode: boolean): Promise<string>;
  saveUserData(userData: UserData): Promise<boolean>;

  checkUpdateStatus(): Promise<boolean>;
  checkBrowserSession(): Promise<BrowserStatus>;
  reseedBrowserProfile(): Promise<BrowserStatus>;
  openAdImagesFolder(): Promise<OpenFolderResult>;
  devTriggerUpdate(): Promise<boolean>;

  /** Subscribes to batch progress; returns an unsubscribe function. */
  onRenewProgress(callback: (progress: RenewProgress) => void): () => void;
}
