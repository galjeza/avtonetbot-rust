import fs from 'node:fs';
import path from 'node:path';

import { app, dialog, type BrowserWindow } from 'electron';
import Jimp from 'jimp';

import type { AdImageSet, AdPhoto } from '@shared/types';
import {
  isPhoto,
  photoFiles,
  readAdImagesMetadata,
  type AdImagesMetadata,
} from '../scraper/utils/ad-images';

/** The scheme the renderer loads saved photos through. */
export const AD_IMAGE_SCHEME = 'adimg';

/** Everything an ad's photos are stored under. */
export function adImagesRoot(): string {
  return path.join(app.getPath('userData'), 'AdImages');
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

/**
 * Heading and detail line for one set.
 *
 * Read from the metadata file beside the photos, which every set acquires
 * either on download or through the startup backfill. A set with none left is
 * one whose directory name predates the naming scheme the backfill can read,
 * and there is nothing in it to recover — so the name itself is the label.
 */
function describe(
  dir: string,
  metadata: AdImagesMetadata | null,
): Pick<AdImageSet, 'title' | 'subtitle'> {
  if (!metadata) return { title: dir, subtitle: '' };

  const title = present([metadata.brand, metadata.model]).map(prettify).join(' ') || dir;

  // Wheels are described by their dimensions rather than a year and a mileage.
  if (metadata.wheel) {
    const { width, inches, bolts, boltCircle, offset } = metadata.wheel;
    return {
      title,
      subtitle: present([
        width && inches && `${width} × ${inches}"`,
        bolts && boltCircle && `${bolts}×${boltCircle}`,
        offset && `ET${offset}`,
      ]).join(' · '),
    };
  }

  return {
    title,
    subtitle: present([
      metadata.year && prettify(metadata.year),
      metadata.km && formatKm(metadata.km),
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
      };
    })
    .filter((set) => set.photoCount > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** The photos in one set, in the order the ad will publish them. */
export function readAdImages(dir: string): AdPhoto[] {
  const setDir = resolveSetDir(dir);

  return photoFiles(setDir).map((file) => {
    const { mtimeMs } = fs.statSync(path.join(setDir, file));
    return {
      file,
      // The modification time doubles as a cache-buster: a replaced photo
      // keeps its file name, and without this the old one stays on screen.
      url: `${AD_IMAGE_SCHEME}://photos/${encodeURIComponent(dir)}/${encodeURIComponent(file)}?v=${Math.round(mtimeMs)}`,
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
