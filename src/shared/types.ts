/** Ad categories avto.net exposes; each has its own results URL and new-ad flow. */
export type AdType = 'car' | 'dostavna' | 'platisca';

/** Wording matches the headings avto.net uses on its own edit pages. */
export const AD_TYPE_LABELS: Record<AdType, string> = {
  car: 'Osebno vozilo',
  dostavna: 'Tovorno vozilo',
  platisca: 'Platišča',
};

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
  /**
   * Which Chrome profile directory to copy the avto.net session from, e.g.
   * "Default" or "Profile 1". Unset means we pick the best candidate
   * ourselves, which is right for everyone who only has one profile.
   */
  chromeProfileDir?: string;
  /**
   * Leaves the bot's Chrome on screen for a minute after a session check
   * instead of closing it, so someone helping the user can see the page the
   * check actually landed on.
   */
  keepBrowserOpen?: boolean;
  brokerId?: string;
  subscriptionPaidTo?: string;
  hdImages?: boolean;
}

/** What the licence server returns for GET /user?email=… */
export interface UserMeta {
  /**
   * Leaves the bot's Chrome on screen for a minute after a session check
   * instead of closing it, so someone helping the user can see the page the
   * check actually landed on.
   */
  keepBrowserOpen?: boolean;
  brokerId?: string;
  subscriptionPaidTo?: string;
  hdImages?: boolean;
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
  /**
   * The Chrome profile directory our copy was taken from, or null while the
   * user has not picked one — which is the state every install starts in,
   * since nothing is copied until they choose.
   */
  profileDir: string | null;
}

/** One of the user's Chrome profiles, as a candidate to copy the session from. */
export interface ChromeProfileInfo {
  /** Directory name inside Chrome's User Data, e.g. "Default" or "Profile 1". */
  dir: string;
  /** What Chrome calls it in its own avatar menu. */
  name: string;
  /** The Google account signed into it, when there is one. */
  accountEmail?: string;
  /** When Chrome last had this profile open, in milliseconds since the epoch. */
  lastActive?: number;
  /** avto.net appears in this profile's cookie database. */
  hasAvtonetCookies: boolean;
}

/** One ad's saved photo set, as listed in the photo editor. */
export interface AdImageSet {
  /** Directory name under AdImages. Identifies the set in every operation. */
  dir: string;
  /** Heading, e.g. "BMW 320d" — from saved metadata, else read off the directory name. */
  title: string;
  /** Supporting detail, e.g. "2015 · 150.000 km". Empty when nothing is known. */
  subtitle: string;
  photoCount: number;
  /** Newest file modification time in the set, ms since the epoch. */
  updatedAt: number;
  adType?: AdType;
}

/** One photo within a set. */
export interface AdPhoto {
  /** File name on disk, e.g. "0.jpg". The order of the list is the ad's order. */
  file: string;
  /** adimg:// URL to render it, carrying a cache-buster so edits show up. */
  url: string;
  bytes: number;
}

export interface OpenFolderResult {
  ok: boolean;
  error?: string;
}
