import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

import { getUserData } from '../../main/store';
import { detectUserProfileDir } from './chrome-path';
import { cookieDbPath, findChromeProfile } from './chrome-profiles';

/**
 * Entries left out of the copy.
 *
 * Two groups: caches and generated model data that Chrome refetches on its own
 * (~130 MB, none of it affecting how the browser fingerprints), and lock files
 * that would make Chrome hand off to the user's running instance instead of
 * starting on our copy.
 *
 * "CURRENT" is deliberately absent — it points LevelDB at its manifest, and
 * dropping it corrupts Local Storage and Extension State.
 */
const SKIP_ENTRIES = new Set([
  // Caches
  'Cache',
  'Code Cache',
  'GPUCache',
  'GrShaderCache',
  'ShaderCache',
  'DawnCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
  'Service Worker',
  'Crashpad',
  'CrashpadMetrics',
  'component_crx_cache',
  'extensions_crx_cache',
  // Generated data and telemetry
  'optimization_guide_model_store',
  'segmentation_platform',
  'WasmTtsEngine',
  'BrowserMetrics',
  'OnDeviceHeadSuggestModel',
  'ActorSafetyLists',
  'hyphen-data',
  'ZxcvbnData',
  'Shared Dictionary',
  'SafetyTips',
  'Subresource Filter',
  'FileTypePolicies',
  'OriginTrials',
  'TpcdMetadata',
  'PKIMetadata',
  // The user's open windows and tabs. Copying these makes the bot browser
  // reopen their entire session, and they are several megabytes besides.
  'Sessions',
  'Session Storage',
  'Current Session',
  'Current Tabs',
  'Last Session',
  'Last Tabs',
  // Locks
  'lockfile',
  'LOCK',
  'LOG',
  'LOG.old',
]);

/** Records which of the user's profiles the copy was taken from. */
const SOURCE_MARKER = 'avtonetbot-source.json';

/** Our own copy, which we are allowed to attach a debugger to. */
export function botProfileDir(): string {
  return path.join(app.getPath('userData'), 'ChromeProfile');
}

/**
 * Which of their Chrome profiles the user picked to copy the session from, or
 * null while they have not picked one.
 *
 * There is no fallback on purpose. Guessing is what produced the failure this
 * replaced: on a machine with several profiles we would copy one that had
 * never seen avto.net, and the only symptom was a browser that reported itself
 * signed out with nothing to say about why.
 */
export function chosenProfileDir(): string | null {
  return getUserData()?.chromeProfileDir ?? null;
}

/**
 * The profile directory *inside* our copy, which is the name it had in the
 * user's Chrome. Kept rather than renamed to "Default" so that everything
 * `Local State` says about the profile still refers to something.
 */
export function seededProfileDir(): string {
  try {
    const raw = fs.readFileSync(path.join(botProfileDir(), SOURCE_MARKER), 'utf8');
    const { profileDir } = JSON.parse(raw) as { profileDir?: string };
    if (profileDir) return profileDir;
  } catch {
    /* copied by a version that predates the marker, or not copied at all */
  }
  return 'Default';
}

/**
 * Escapes Windows' 260-character path limit.
 *
 * Our copy sits deeper than the source it comes from, and Chrome's IndexedDB
 * and extension directories are long to begin with, so the plain path can run
 * out where the original had room.
 */
function longPath(target: string): string {
  if (process.platform !== 'win32' || target.startsWith('\\\\')) return target;
  const absolute = path.resolve(target);
  return /^[a-zA-Z]:\\/.test(absolute) ? `\\\\?\\${absolute}` : absolute;
}

/**
 * Copies one file, recording it as a failure only when both attempts fail.
 *
 * The retry is the point. On Windows `copyFileSync` goes through `CopyFileW`,
 * which opens the source in a mode Chrome's own open handles refuse, so the
 * cookie database of a running browser is exactly the file it drops. Reading
 * and writing the bytes ourselves uses a handle that tolerates Chrome's, and
 * gets files the copy cannot.
 */
function copyFile(src: string, dst: string, failures: string[]): void {
  try {
    fs.copyFileSync(longPath(src), longPath(dst));
    return;
  } catch {
    /* held open by the running browser, or too long a path */
  }
  try {
    fs.writeFileSync(longPath(dst), fs.readFileSync(longPath(src)));
  } catch {
    failures.push(src);
  }
}

function readEntries(from: string): fs.Dirent[] {
  try {
    return fs.readdirSync(longPath(from), { withFileTypes: true });
  } catch {
    return [];
  }
}

function copyTree(from: string, to: string, failures: string[]): void {
  fs.mkdirSync(longPath(to), { recursive: true });

  for (const entry of readEntries(from)) {
    if (SKIP_ENTRIES.has(entry.name) || entry.name.startsWith('Singleton')) continue;

    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyTree(src, dst, failures);
    } else if (entry.isFile()) {
      copyFile(src, dst, failures);
    }
  }
}

/**
 * Fails the seed when the two files the avto.net session depends on did not
 * survive the copy.
 *
 * Without this the failure is invisible: a copy that lost the cookie database
 * looks exactly like one that worked, right up until the bot browser turns out
 * to be signed out — and since we only seed when the destination is missing,
 * that state then sticks.
 *
 * Windows is where it happens. Chrome holds its own files open in a mode that
 * refuses ours, so a seed taken while the user's browser is running can come
 * out short.
 */
function verifySeed(dst: string, profileDir: string, failures: string[]): void {
  const missing: string[] = [];
  try {
    if (fs.statSync(path.join(dst, 'Local State')).size === 0) missing.push('Local State');
  } catch {
    missing.push('Local State');
  }
  if (!cookieDbPath(path.join(dst, profileDir))) missing.push('Cookies');
  if (missing.length === 0) return;

  const skipped = failures.length ? ` Neuspešno prekopiranih datotek: ${failures.length}.` : '';
  throw new Error(
    `Chromovega profila ni bilo mogoče v celoti kopirati (manjka: ${missing.join(', ')}). ` +
      `Zaprite vsa okna Chroma in poskusite znova.${skipped}`,
  );
}

/**
 * Seeds our profile from the user's Chrome the first time.
 *
 * Chrome 136+ refuses --remote-debugging-port when the *default* profile
 * directory is in use, so we cannot drive the browser the user runs normally.
 * Copying carries their avto.net login across, because that cookie is
 * persistent (about a week) and therefore lives in the Cookies database.
 *
 * Only the one profile the user picked is copied, not all of them: someone
 * signed into several Google accounts has several, and copying the lot both
 * took minutes and left us starting Chrome on whichever one happened to be
 * called "Default" — often not the one holding the avto.net session.
 *
 * @returns true when this call performed the copy.
 */
export function ensureBotProfile(force = false): boolean {
  const chosen = chosenProfileDir();
  if (!chosen) {
    throw new Error('Izberite Chromov profil, iz katerega naj program prekopira prijavo.');
  }

  const dst = botProfileDir();
  const exists = fs.existsSync(dst);
  // A profile picked after the last copy has to take effect, so the choice is
  // not silently ignored until the user thinks to refresh by hand.
  const stale = exists && seededProfileDir() !== chosen;
  if (exists && !force && !stale) return false;

  const src = detectUserProfileDir();
  if (!fs.existsSync(src)) {
    throw new Error(
      'Chromovega profila ni bilo mogoče najti. Odprite Chrome in se prijavite v avto.net.',
    );
  }

  const profile = findChromeProfile(chosen);
  if (!profile) {
    throw new Error(`Izbranega Chromovega profila ("${chosen}") ni več. Izberite drugega.`);
  }

  // A profile that has never been browsed with has nothing for us to carry
  // across, and would otherwise fail the check after the copy with a message
  // about closing Chrome — which would not be the problem.
  if (!cookieDbPath(path.join(src, profile.dir))) {
    throw new Error(
      `Chromov profil "${profile.name}" nima shranjenih piškotkov. ` +
        'Odprite ga v Chromu, se prijavite v avto.net in poskusite znova.',
    );
  }

  if (exists) fs.rmSync(dst, { recursive: true, force: true });
  fs.mkdirSync(dst, { recursive: true });

  const failures: string[] = [];

  // Root-level files, for `Local State` above all: it holds the key the cookie
  // database is encrypted with, and without it Chrome discards every cookie it
  // cannot decrypt. The directories beside it are caches and the other
  // profiles, so none of them are worth the copy.
  for (const entry of readEntries(src)) {
    if (!entry.isFile() || SKIP_ENTRIES.has(entry.name) || entry.name.startsWith('Singleton')) {
      continue;
    }
    copyFile(path.join(src, entry.name), path.join(dst, entry.name), failures);
  }

  copyTree(path.join(src, profile.dir), path.join(dst, profile.dir), failures);
  verifySeed(dst, profile.dir, failures);

  fs.writeFileSync(
    path.join(dst, SOURCE_MARKER),
    JSON.stringify({ profileDir: profile.dir }, null, 2),
  );
  return true;
}
