import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

import { detectUserProfileDir } from './chrome-path';

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

/** Our own copy, which we are allowed to attach a debugger to. */
export function botProfileDir(): string {
  return path.join(app.getPath('userData'), 'ChromeProfile');
}

function copyTree(from: string, to: string): void {
  fs.mkdirSync(to, { recursive: true });

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(from, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (SKIP_ENTRIES.has(entry.name) || entry.name.startsWith('Singleton')) continue;

    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    try {
      if (entry.isDirectory()) {
        copyTree(src, dst);
      } else if (entry.isFile()) {
        // A profile that is currently open can hold files we cannot read;
        // skip those rather than abort the whole copy.
        fs.copyFileSync(src, dst);
      }
    } catch {
      /* locked or vanished mid-copy */
    }
  }
}

/**
 * Seeds our profile from the user's Chrome the first time.
 *
 * Chrome 136+ refuses --remote-debugging-port when the *default* profile
 * directory is in use, so we cannot drive the browser the user runs normally.
 * Copying carries their avto.net login across, because that cookie is
 * persistent (about a week) and therefore lives in the Cookies database.
 *
 * @returns true when this call performed the copy.
 */
export function ensureBotProfile(force = false): boolean {
  const dst = botProfileDir();
  if (fs.existsSync(dst) && !force) return false;

  const src = detectUserProfileDir();
  if (!fs.existsSync(src)) {
    throw new Error(
      'Chromovega profila ni bilo mogoče najti. Odprite Chrome in se prijavite v avto.net.',
    );
  }

  if (force && fs.existsSync(dst)) fs.rmSync(dst, { recursive: true, force: true });
  copyTree(src, dst);
  return true;
}
