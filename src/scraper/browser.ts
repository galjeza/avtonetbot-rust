import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { app } from 'electron';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';

import { LOGIN_SUCCESS_URL, DEFAULT_TIMEOUT_MS } from './constants';
import { getUserData } from '../main/store';

const DEBUG_PORT = 9222;
const PORT_POLL_INTERVAL_MS = 250;
const PORT_WAIT_TIMEOUT_MS = 30 * 1000;

const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';

/**
 * Caches and locks we never want in the copy. Skipping the caches keeps it
 * small; skipping Singleton* stops Chrome handing off to the user's running
 * instance instead of starting on our profile.
 */
const SKIP_ENTRIES = new Set([
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
  'optimization_guide_model_store',
  'segmentation_platform',
  // Static assets and telemetry Chrome refetches or regenerates on its own.
  // Roughly 130 MB, and none of it contributes to how the browser fingerprints.
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
  // Lock files; copying them makes Chrome think another instance owns this
  // profile. "CURRENT" is deliberately NOT skipped — it points LevelDB at its
  // manifest, and dropping it corrupts Local Storage and Extension State.
  'lockfile',
  'LOCK',
  'LOG',
  'LOG.old',
]);

function findInPath(binaryName: string): string | null {
  const pathEnv = process.env.PATH || '';
  const sep = isWindows ? ';' : ':';
  for (const dir of pathEnv.split(sep)) {
    if (!dir) continue;
    const full = path.join(dir, binaryName);
    try {
      if (fs.existsSync(full)) return full;
    } catch {
      /* unreadable PATH entry */
    }
  }
  try {
    const out = execFileSync(isWindows ? 'where' : 'which', [binaryName], {
      encoding: 'utf8',
    }).trim();
    const first = out.split('\n')[0]?.trim();
    if (first && fs.existsSync(first)) return first;
  } catch {
    /* not on PATH */
  }
  return null;
}

export function detectChromeExecutable(): string | null {
  if (isWindows) {
    const candidates = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      process.env.LOCALAPPDATA &&
        path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ].filter(Boolean) as string[];
    for (const c of candidates) if (fs.existsSync(c)) return c;
    return findInPath('chrome.exe');
  }
  if (isMac) {
    const candidates = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    ];
    for (const c of candidates) if (fs.existsSync(c)) return c;
    return findInPath('google-chrome') || findInPath('chromium');
  }
  const candidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/run/current-system/sw/bin/google-chrome',
    '/run/current-system/sw/bin/google-chrome-stable',
    '/run/current-system/sw/bin/chromium',
    path.join(os.homedir(), '.nix-profile/bin/google-chrome'),
    path.join(os.homedir(), '.nix-profile/bin/google-chrome-stable'),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const found = findInPath(name);
    if (found) return found;
  }
  return null;
}

/** Where Chrome keeps the profile the user browses with day to day. */
export function detectUserProfileDir(): string {
  if (isWindows) {
    return path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data');
  }
  if (isMac) {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
  }
  return path.join(os.homedir(), '.config', 'google-chrome');
}

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

function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(
      { host: '127.0.0.1', port, path: '/json/version', timeout: 1000 },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForDebugPort(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(DEBUG_PORT)) return true;
    await new Promise((r) => setTimeout(r, PORT_POLL_INTERVAL_MS));
  }
  return false;
}

function fetchBrowserWSEndpoint(): Promise<string> {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port: DEBUG_PORT, path: '/json/version' }, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            const { webSocketDebuggerUrl } = JSON.parse(body);
            if (!webSocketDebuggerUrl) {
              reject(new Error('Manjka webSocketDebuggerUrl v /json/version'));
              return;
            }
            resolve(webSocketDebuggerUrl);
          } catch (e) {
            reject(e as Error);
          }
        });
      })
      .on('error', reject);
  });
}

function resolveChromePath(): string | null {
  const stored = getUserData()?.chromePath;
  if (stored && fs.existsSync(stored)) return stored;
  return detectChromeExecutable();
}

export interface BrowserSession {
  browser: Browser;
  page: Page;
  release: () => Promise<void>;
  profileSeeded: boolean;
}

export async function setupBrowser(): Promise<BrowserSession> {
  const chromePath = resolveChromePath();
  if (!chromePath) {
    throw new Error(
      'Google Chrome ni najden. Namestite Chrome ali nastavite pot v konfiguraciji.',
    );
  }

  const profileSeeded = ensureBotProfile();
  const userDataDir = botProfileDir();

  if (!(await isPortOpen(DEBUG_PORT))) {
    const proc = spawn(
      chromePath,
      [
        `--remote-debugging-port=${DEBUG_PORT}`,
        `--user-data-dir=${userDataDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--restore-last-session',
      ],
      { detached: true, stdio: 'ignore' },
    );
    proc.unref();

    if (!(await waitForDebugPort(PORT_WAIT_TIMEOUT_MS))) {
      throw new Error(
        'Chroma ni bilo mogoče zagnati z razhroščevalnim vratom. Zaprite vsa okna programa Chrome in poskusite znova.',
      );
    }
  }

  const browser = await puppeteer.connect({
    browserWSEndpoint: await fetchBrowserWSEndpoint(),
    defaultViewport: null,
    protocolTimeout: 0,
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(DEFAULT_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(DEFAULT_TIMEOUT_MS);

  const release = async (): Promise<void> => {
    try {
      if (!page.isClosed()) await page.close();
    } catch {
      /* already gone */
    }
    try {
      await browser.disconnect();
    } catch {
      /* already gone */
    }
  };

  return { browser, page, release, profileSeeded };
}

/**
 * Asks for the account page and reports where we land. A redirect away from
 * it means the copied session has expired.
 */
export async function isLoggedIn(page: Page): Promise<{ loggedIn: boolean; finalUrl: string }> {
  await page.goto(LOGIN_SUCCESS_URL, { waitUntil: 'domcontentloaded', timeout: 0 });
  const finalUrl = page.url();
  return { loggedIn: finalUrl.startsWith(LOGIN_SUCCESS_URL), finalUrl };
}

/**
 * Closes the Chrome we launched, then replaces our profile with a fresh copy
 * of the user's. Chrome must be shut down first — deleting a profile
 * directory out from under a running browser corrupts it.
 */
export async function reseedBotProfile(): Promise<void> {
  if (await isPortOpen(DEBUG_PORT)) {
    try {
      const browser = await puppeteer.connect({
        browserWSEndpoint: await fetchBrowserWSEndpoint(),
      });
      await browser.close();
    } catch {
      /* already gone */
    }

    // Give the process time to release its file handles.
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline && (await isPortOpen(DEBUG_PORT))) {
      await new Promise((r) => setTimeout(r, PORT_POLL_INTERVAL_MS));
    }
  }

  ensureBotProfile(true);
}

/** Reports whether the copied profile still holds a valid avto.net session. */
export async function checkBrowserSession(): Promise<{
  loggedIn: boolean;
  finalUrl: string;
  profileSeeded: boolean;
}> {
  const { page, release, profileSeeded } = await setupBrowser();
  try {
    const { loggedIn, finalUrl } = await isLoggedIn(page);
    return { loggedIn, finalUrl, profileSeeded };
  } finally {
    await release().catch(() => undefined);
  }
}
