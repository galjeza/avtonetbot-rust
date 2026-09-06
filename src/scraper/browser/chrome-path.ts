import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { getUserData } from '../../main/store';

const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';

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

function detectChromeExecutable(): string | null {
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

/** A path configured by the user wins over auto-detection. */
export function resolveChromePath(): string | null {
  const stored = getUserData()?.chromePath;
  if (stored && fs.existsSync(stored)) return stored;
  return detectChromeExecutable();
}
