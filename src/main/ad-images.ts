import fs from 'node:fs';
import path from 'node:path';

import { app, dialog, type BrowserWindow } from 'electron';
import Jimp from 'jimp';

import type { AdImageSet, AdPhoto } from '@shared/types';
import { readAdImagesMetadata, type AdImagesMetadata } from '../scraper/utils/ad-images';

/** The scheme the renderer loads saved photos through. */
export const AD_IMAGE_SCHEME = 'adimg';

/** Everything an ad's photos are stored under. */
export function adImagesRoot(): string {
  return path.join(app.getPath('userData'), 'AdImages');
}

/** Only .jpg files are uploaded, so only they count as an ad's photos. */
const isPhoto = (file: string): boolean => file.toLowerCase().endsWith('.jpg');

/**
 * The order the ad is published in: by the leading number, so 2.jpg precedes
 * 10.jpg. Matches how the upload step reads the directory.
 */
function naturalOrder(a: string, b: string): number {
  const numA = parseInt(a.match(/\d+/)?.[0] ?? '0', 10);
  const numB = parseInt(b.match(/\d+/)?.[0] ?? '0', 10);
  return numA - numB || a.localeCompare(b);
}

function photoFiles(dir: string): string[] {
  try {
    return fs.readdirSync(dir).filter(isPhoto).sort(naturalOrder);
  } catch {
    return [];
  }
}

/** Refuses anything that is not a direct child directory of the root. */
function resolveSetDir(dir: string): string {
  const root = adImagesRoot();
  const target = path.resolve(root, dir);
  if (path.dirname(target) !== path.resolve(root)) {
    throw new Error(`Neveljavna mapa slik: ${dir}`);
  }
  return target;
}

/**
 * Field names the current directory-naming scheme writes into the directory,
 * lowercased the way the name itself is.
 *
 * Only this scheme is read. Older ones exist on disk from previous versions
 * and are still honoured when photos are looked up for an upload, but they are
 * not worth parsing here: anything downloaded from now on carries metadata,
 * and a set we cannot name still lists and edits perfectly well.
 */
const VEHICLE_KEYS = ['znamkavozila', 'modelvozila', 'prevozenikm', 'letoreg'];
const WHEEL_KEYS = ['znamka', 'sirina', 'col', 'vijakov', 'premer', 'et'];

/**
 * Splits a directory name back into the fields it was built from.
 *
 * The name is `key + value` repeated with no separator, so a value is whatever
 * sits between one key and the next. Which keys appear in which order follows
 * the order the ad's form was scraped in, not the order they are listed here,
 * so the keys are located wherever they happen to fall rather than expected in
 * sequence — insisting on an order is what made this give up and fall back to
 * showing the raw directory name.
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

/**
 * Undoes what sanitising the directory name did to it, as far as it can be
 * undone: underscores were spaces, and the whole thing was lowercased. Short
 * words are put back in capitals, which is right far more often than not for
 * car makes — BMW, VW, KIA — and harmless when it is not.
 */
function prettify(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((word) => (word.length <= 3 ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1)))
    .join(' ');
}

const formatKm = (km: string): string =>
  /^\d+$/.test(km) ? `${Number(km).toLocaleString('sl-SI')} km` : prettify(km);

const present = (values: (string | undefined)[]): string[] =>
  values.filter((value): value is string => Boolean(value));

/** Heading and detail line for one set, from its metadata or from its name. */
function describe(
  dir: string,
  metadata: AdImagesMetadata | null,
): Pick<AdImageSet, 'title' | 'subtitle'> {
  const vehicle = (
    brand?: string,
    model?: string,
    year?: string,
    km?: string,
  ): Pick<AdImageSet, 'title' | 'subtitle'> => ({
    title: present([brand, model]).map(prettify).join(' ') || dir,
    subtitle: present([year && prettify(year), km && formatKm(km)]).join(' · '),
  });

  if (metadata) return vehicle(metadata.brand, metadata.model, metadata.year, metadata.km);

  const parsed = parseDirName(dir);
  if (!parsed) return { title: dir, subtitle: '' };

  if (parsed.znamkavozila || parsed.modelvozila) {
    return vehicle(parsed.znamkavozila, parsed.modelvozila, parsed.letoreg, parsed.prevozenikm);
  }

  // Wheels are described by their dimensions rather than a year and a mileage.
  const { znamka, sirina, col, vijakov, premer, et } = parsed;
  return {
    title: znamka ? prettify(znamka) : dir,
    subtitle: present([
      sirina && col && `${sirina} × ${col}"`,
      vijakov && premer && `${vijakov}×${premer}`,
      et && `ET${et}`,
    ]).join(' · '),
  };
}

/** Every ad that has photos saved, most recently changed first. */
export function listAdImageSets(): AdImageSet[] {
  const root = adImagesRoot();

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const setDir = path.join(root, entry.name);
      const files = photoFiles(setDir);
      const metadata = readAdImagesMetadata(setDir);

      const updatedAt = files.reduce((newest, file) => {
        try {
          return Math.max(newest, fs.statSync(path.join(setDir, file)).mtimeMs);
        } catch {
          return newest;
        }
      }, 0);

      return {
        dir: entry.name,
        ...describe(entry.name, metadata),
        photoCount: files.length,
        updatedAt,
        adType: metadata?.adType,
      };
    })
    .filter((set) => set.photoCount > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** The photos in one set, in the order the ad will publish them. */
export function readAdImages(dir: string): AdPhoto[] {
  const setDir = resolveSetDir(dir);

  return photoFiles(setDir).map((file) => {
    const stats = fs.statSync(path.join(setDir, file));
    return {
      file,
      // The modification time doubles as a cache-buster: a replaced photo
      // keeps its file name, and without this the old one stays on screen.
      url: `${AD_IMAGE_SCHEME}://photos/${encodeURIComponent(dir)}/${encodeURIComponent(file)}?v=${Math.round(stats.mtimeMs)}`,
      bytes: stats.size,
    };
  });
}

/**
 * Rewrites the set so its photos are `0.jpg`, `1.jpg`, … in the given order,
 * and drops any photo left out of the list.
 *
 * This is the one primitive behind both reordering and removing, because they
 * are the same operation to the upload step: it reads the directory in
 * numeric order, so position *is* the file name and a gap in the numbering is
 * indistinguishable from a deletion.
 *
 * Renaming happens in two passes through temporary names, since going straight
 * to the final ones would have a photo overwrite a neighbour it has not been
 * moved out of the way of yet.
 */
export function applyAdImageOrder(dir: string, order: string[]): AdPhoto[] {
  const setDir = resolveSetDir(dir);
  const present = new Set(photoFiles(setDir));

  const keep = order.filter((file) => present.has(file));
  if (keep.length === 0) throw new Error('Oglas mora obdržati vsaj eno fotografijo.');

  const staged = keep.map((file, index) => {
    const temporary = `.reorder-${index}.tmp`;
    fs.renameSync(path.join(setDir, file), path.join(setDir, temporary));
    return temporary;
  });

  // Anything not staged was left out of the new order, so it is being removed.
  for (const file of present) {
    if (keep.includes(file)) continue;
    fs.rmSync(path.join(setDir, file), { force: true });
  }

  staged.forEach((temporary, index) => {
    fs.renameSync(path.join(setDir, temporary), path.join(setDir, `${index}.jpg`));
  });

  return readAdImages(dir);
}

const PICKER_FILTERS = [{ name: 'Slike', extensions: ['jpg', 'jpeg', 'png', 'webp'] }];

/**
 * Puts a chosen file into the set as a JPEG.
 *
 * Already-JPEG files are copied rather than re-encoded, which would throw away
 * a little quality for nothing. Note that nothing here softens the photo the
 * way a downloaded one is: that exists to stop a re-uploaded ad being
 * byte-identical to the one it replaces, and a file off the user's disk never
 * was.
 */
async function importPhoto(source: string, target: string): Promise<void> {
  if (/\.jpe?g$/i.test(source)) {
    fs.copyFileSync(source, target);
    return;
  }
  const image = await Jimp.read(source);
  image.quality(92);
  await image.writeAsync(target);
}

async function pickImages(window: BrowserWindow | null, multiple: boolean): Promise<string[]> {
  const properties: ('openFile' | 'multiSelections')[] = multiple
    ? ['openFile', 'multiSelections']
    : ['openFile'];

  const result = window
    ? await dialog.showOpenDialog(window, { properties, filters: PICKER_FILTERS })
    : await dialog.showOpenDialog({ properties, filters: PICKER_FILTERS });

  return result.canceled ? [] : result.filePaths;
}

/** Swaps one photo for a file the user picks, keeping its position. */
export async function replaceAdImage(
  window: BrowserWindow | null,
  dir: string,
  file: string,
): Promise<AdPhoto[]> {
  const setDir = resolveSetDir(dir);
  if (!photoFiles(setDir).includes(file)) throw new Error(`Fotografije ${file} ni več.`);

  const [source] = await pickImages(window, false);
  if (!source) return readAdImages(dir);

  await importPhoto(source, path.join(setDir, file));
  return readAdImages(dir);
}

/** Appends files the user picks to the end of the set. */
export async function addAdImages(window: BrowserWindow | null, dir: string): Promise<AdPhoto[]> {
  const setDir = resolveSetDir(dir);
  const sources = await pickImages(window, true);
  if (sources.length === 0) return readAdImages(dir);

  let next = photoFiles(setDir).length;
  for (const source of sources) {
    await importPhoto(source, path.join(setDir, `${next}.jpg`));
    next += 1;
  }

  // The set may have had gaps in its numbering before we appended to it.
  return applyAdImageOrder(dir, photoFiles(setDir));
}

/** Opens one set's directory in the system file manager. */
export function adImageSetPath(dir: string): string {
  return resolveSetDir(dir);
}

/**
 * Serves saved photos to the renderer.
 *
 * A custom scheme rather than data URLs: a set runs to twenty photos of a
 * megabyte or more each, and inlining that much base64 into the page to draw a
 * grid of thumbnails is wasteful. A file:// URL would not do either, since in
 * development the renderer is served over http and would refuse it.
 *
 * The path is resolved against the photos root and rejected if it lands
 * outside, so a crafted URL cannot read the rest of the disk.
 */
export async function handleAdImageRequest(request: Request): Promise<Response> {
  let target: string;
  try {
    const { pathname } = new URL(request.url);
    const [dir, file] = pathname.replace(/^\/+/, '').split('/').map(decodeURIComponent);
    if (!dir || !file || !isPhoto(file)) return new Response(null, { status: 404 });
    target = path.join(resolveSetDir(dir), file);
  } catch {
    return new Response(null, { status: 403 });
  }

  try {
    return new Response(fs.readFileSync(target), {
      headers: { 'content-type': 'image/jpeg', 'cache-control': 'no-cache' },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
