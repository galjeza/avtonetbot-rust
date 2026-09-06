/** Ad categories avto.net exposes; each has its own results URL and new-ad flow. */
export type AdType = 'car' | 'dostavna' | 'platisca';

export interface ActiveAd {
  name: string;
  price: string;
  photoUrl: string;
  adUrl: string;
  adId: string;
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
  adType: AdType;
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
