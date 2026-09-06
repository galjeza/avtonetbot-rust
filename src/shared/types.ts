/** Ad categories avto.net exposes; each has its own results URL and new-ad flow. */
export type AdType = 'car' | 'dostavna' | 'platisca';

export interface ActiveAd {
  name: string;
  price: string;
  photoUrl: string;
  adUrl: string;
  adId: string;
  /**
   * Which results list the ad was scraped from. The edit page is the
   * authority on an ad's real type; this is only a fallback for when that
   * heading cannot be read.
   */
  sourceType: AdType;
}

/** Persisted in electron-store under the `userData` key. */
export interface UserData {
  email: string;
  password: string;
  chromePath?: string;
  brokerId?: string;
  subscriptionPaidTo?: string;
  hdImages?: boolean;
}

/** What the licence server returns for GET /user?email=… */
export interface UserMeta {
  brokerId?: string;
  subscriptionPaidTo?: string;
  hdImages?: boolean;
}

export interface RenewOptions {
  ads: ActiveAd[];
  pause: number;
  testMode: boolean;
}

/** Progress pushed from the main process while a batch runs. */
export interface RenewProgress {
  index: number;
  total: number;
  adId: string;
  step: string;
  status: 'running' | 'done' | 'failed' | 'waiting';
  message?: string;
  /** Resolved once the edit page has been read. */
  adType?: AdType;
}

export interface BrowserStatus {
  loggedIn: boolean;
  finalUrl: string;
  profileSeeded: boolean;
}

export interface OpenFolderResult {
  ok: boolean;
  error?: string;
}
