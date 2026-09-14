import fs from 'node:fs';
import path from 'node:path';

import {
  readAdImagesMetadata,
  writeAdImagesMetadata,
  type AdImagesMetadata,
} from '../scraper/utils/ad-images';
import { adImagesRoot } from './ad-images';

/**
 * Field names the directory-naming schemes write into the directory,
 * lowercased the way the name itself is.
 */
const VEHICLE_KEYS = ['znamkavozila', 'modelvozila', 'prevozenikm', 'letoreg', 'tipvozila', 'cena'];
const WHEEL_KEYS = ['znamka', 'sirina', 'col', 'vijakov', 'premer', 'et'];

/**
 * Splits a directory name back into the fields it was built from.
 *
 * The name is `key + value` repeated with no separator, so a value is whatever
 * sits between one key and the next. Which keys appear in which order follows
 * the order the ad's form was scraped in, not the order they are listed here,
 * so the keys are located wherever they happen to fall rather than expected in
 * sequence.
 *
 * This only understands the schemes that prefix each value with its field
 * name. The oldest scheme concatenated bare values, and nothing can recover
 * fields from that — those sets keep their directory name as their label.
 */
function parseDirName(dir: string): Record<string, string> | null {
  const wheels = !dir.includes('znamkavozila') && !dir.includes('modelvozila');
  const keys = wheels ? WHEEL_KEYS : VEHICLE_KEYS;

  // Longest first: alternation takes the first branch that matches, and
  // without this "znamkavozila" would be read as "znamka" followed by a value
  // beginning "vozila".
  const pattern = new RegExp([...keys].sort((a, b) => b.length - a.length).join('|'), 'g');

  const hits: { key: string; at: number; after: number }[] = [];
  for (const match of dir.matchAll(pattern)) {
    const at = match.index;
    if (at === undefined) continue;
    // A key this short can occur inside a value — "et" sits in the middle of a
    // make like "borbet" — so it only counts where a numeric value just ended.
    // Longer keys are distinctive enough to take wherever they fall.
    if (match[0].length <= 2 && at > 0 && !/\d/.test(dir[at - 1])) continue;
    // A key that somehow appears twice belongs to its first position.
    if (hits.some((hit) => hit.key === match[0])) continue;
    hits.push({ key: match[0], at, after: at + match[0].length });
  }

  if (hits.length === 0) return null;

  const parsed: Record<string, string> = {};
  hits.forEach((hit, index) => {
    const end = index + 1 < hits.length ? hits[index + 1].at : dir.length;
    parsed[hit.key] = dir.slice(hit.after, end);
  });
  return parsed;
}

function metadataFromDirName(dir: string): AdImagesMetadata | null {
  const parsed = parseDirName(dir);
  if (!parsed) return null;

  if (parsed.znamkavozila || parsed.modelvozila) {
    return {
      brand: parsed.znamkavozila,
      model: parsed.modelvozila,
      year: parsed.letoreg,
      km: parsed.prevozenikm,
    };
  }

  const { znamka, sirina, col, vijakov, premer, et } = parsed;
  if (!znamka && !sirina && !col) return null;
  return {
    brand: znamka,
    wheel: { width: sirina, inches: col, bolts: vijakov, boltCircle: premer, offset: et },
  };
}

/**
 * Gives sets saved by earlier versions the metadata file that current ones
 * write for themselves.
 *
 * Runs once per set: everything downloaded from now on arrives with metadata,
 * and everything already on disk gets it here. That leaves the directory-name
 * parser above with no callers except this migration, so it can be deleted
 * outright once installs have had a release or two to run it.
 *
 * Photos are the only thing that matters in these directories, so nothing here
 * is allowed to fail loudly — a set we cannot label still lists and edits.
 */
export function backfillAdImagesMetadata(): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(adImagesRoot(), { withFileTypes: true });
  } catch {
    return; // nothing downloaded yet
  }

  let written = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const setDir = path.join(adImagesRoot(), entry.name);
    if (readAdImagesMetadata(setDir)) continue;

    const metadata = metadataFromDirName(entry.name);
    if (!metadata) continue;

    writeAdImagesMetadata(setDir, { ...metadata, savedAt: new Date().toISOString() });
    written += 1;
  }

  if (written > 0) console.log('[adImages] Backfilled metadata for older sets', { written });
}
