import type {
  ActiveAd,
  AdImageSet,
  AdPhoto,
  BrowserStatus,
  ChromeProfileInfo,
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

  /** The running build's version, straight from app.getVersion(). */
  getAppVersion(): Promise<string>;
  checkUpdateStatus(): Promise<boolean>;
  checkBrowserSession(): Promise<BrowserStatus>;
  reseedBrowserProfile(): Promise<BrowserStatus>;
  /**
   * Opens the bot's browser on avto.net and resolves once the user has signed
   * in there, or after five minutes without them doing so.
   */
  signInManually(): Promise<BrowserStatus>;

  /** The user's Chrome profiles, best candidate for the avto.net session first. */
  listChromeProfiles(): Promise<ChromeProfileInfo[]>;
  /** Copies the session from a different profile and re-checks it. */
  selectChromeProfile(profileDir: string): Promise<BrowserStatus>;
  openAdImagesFolder(): Promise<OpenFolderResult>;
  openAdImageSetFolder(dir: string): Promise<OpenFolderResult>;

  /** Every ad with photos saved, most recently changed first. */
  listAdImageSets(): Promise<AdImageSet[]>;
  /** One set's photos, in the order the ad will publish them. */
  readAdImages(dir: string): Promise<AdPhoto[]>;
  /**
   * Rewrites the set to exactly this order. Photos left out are deleted, so
   * this covers both reordering and removing.
   */
  applyAdImageOrder(dir: string, order: string[]): Promise<AdPhoto[]>;
  /** Asks for a file and puts it in that photo's place. */
  replaceAdImage(dir: string, file: string): Promise<AdPhoto[]>;
  /** Asks for files and appends them to the set. */
  addAdImages(dir: string): Promise<AdPhoto[]>;

  /** Subscribes to batch progress; returns an unsubscribe function. */
  onRenewProgress(callback: (progress: RenewProgress) => void): () => void;
}
