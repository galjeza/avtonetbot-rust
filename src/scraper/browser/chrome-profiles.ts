import fs from 'node:fs';
import path from 'node:path';

import type { ChromeProfileInfo } from '@shared/types';
import { detectUserProfileDir } from './chrome-path';

/**
 * Directories that sit alongside the real profiles and carry a `Preferences`
 * file like they do, but that nobody browses with.
 */
const IGNORED_PROFILE_DIRS = new Set(['System Profile', 'Guest Profile']);

/** What a profile's cookie database contains once avto.net has been visited. */
const AVTONET_HOST = Buffer.from('avto.net', 'latin1');

interface LocalStateProfileInfo {
  name?: string;
  user_name?: string;
  /** Seconds since the epoch, with a fractional part. */
  active_time?: number;
}

/**
 * Chrome's own record of each profile: the name shown in its avatar menu, the
 * Google account signed into it, and when it was last used.
 */
function readInfoCache(userDataDir: string): Record<string, LocalStateProfileInfo> {
  try {
    const raw = fs.readFileSync(path.join(userDataDir, 'Local State'), 'utf8');
    return (
      (JSON.parse(raw) as { profile?: { info_cache?: Record<string, LocalStateProfileInfo> } })
        ?.profile?.info_cache ?? {}
    );
  } catch {
    return {};
  }
}

/**
 * Where a profile keeps its cookies.
 *
 * Chrome moved the database under `Network/` around version 96; installations
 * that predate the move still keep it in the profile root, and a profile that
 * has never been opened has neither.
 */
export function cookieDbPath(profileDir: string): string | null {
  const candidates = [
    path.join(profileDir, 'Network', 'Cookies'),
    path.join(profileDir, 'Cookies'),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).size > 0) return candidate;
    } catch {
      /* not this one */
    }
  }
  return null;
}

/**
 * Whether this profile has ever held an avto.net cookie.
 *
 * The database is SQLite and the cookie *values* are encrypted, but `host_key`
 * is stored as plain text inside the record, so scanning the bytes answers the
 * question without a SQLite dependency — Electron 33 ships Node 20, which has
 * no built-in reader, and a native one would need rebuilding per platform.
 *
 * It cannot tell a live session from an expired one. That is what the login
 * check after seeding is for; this only has to rank the candidates.
 */
function hasAvtonetCookies(profileDir: string): boolean {
  const db = cookieDbPath(profileDir);
  if (!db) return false;
  try {
    return fs.readFileSync(db).includes(AVTONET_HOST);
  } catch {
    return false;
  }
}

/**
 * Best candidate first: a profile that has been on avto.net beats one that has
 * not, and among equals the one used most recently wins.
 */
function compare(a: ChromeProfileInfo, b: ChromeProfileInfo): number {
  if (a.hasAvtonetCookies !== b.hasAvtonetCookies) return a.hasAvtonetCookies ? -1 : 1;
  if (a.lastActive !== b.lastActive) return (b.lastActive ?? 0) - (a.lastActive ?? 0);
  return a.dir.localeCompare(b.dir);
}

/**
 * Every Chrome profile the user has, ranked by how likely it is to be the one
 * signed in to avto.net. The user makes the actual choice; the ranking only
 * decides what the list they choose from looks like.
 *
 * A profile directory is one that holds a `Preferences` file — the names are
 * not reliable on their own, since only the first is called "Default" and the
 * rest are "Profile 1", "Profile 2" and so on regardless of what the user
 * renamed them to in Chrome.
 */
export function listChromeProfiles(userDataDir = detectUserProfileDir()): ChromeProfileInfo[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(userDataDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const infoCache = readInfoCache(userDataDir);

  return entries
    .filter(
      (entry) =>
        entry.isDirectory() &&
        !IGNORED_PROFILE_DIRS.has(entry.name) &&
        fs.existsSync(path.join(userDataDir, entry.name, 'Preferences')),
    )
    .map((entry) => {
      const info = infoCache[entry.name];
      return {
        dir: entry.name,
        name: info?.name || entry.name,
        accountEmail: info?.user_name || undefined,
        lastActive: info?.active_time ? Math.round(info.active_time * 1000) : undefined,
        hasAvtonetCookies: hasAvtonetCookies(path.join(userDataDir, entry.name)),
      };
    })
    .sort(compare);
}

/**
 * Looks up one profile by its directory name.
 *
 * Returns null when it is gone — a profile the user picked can be deleted in
 * Chrome afterwards, and copying from a directory that no longer exists would
 * produce an empty seed rather than an error.
 */
export function findChromeProfile(profileDir: string): ChromeProfileInfo | null {
  return listChromeProfiles().find((profile) => profile.dir === profileDir) ?? null;
}
