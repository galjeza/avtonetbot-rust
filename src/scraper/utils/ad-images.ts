import fs from 'node:fs';
import path from 'node:path';

import type { AdType } from '@shared/types';

import type { CarField } from './car-fields';

/**
 * Directory name for an ad's photos, derived from a few identifying fields.
 *
 * Four schemes exist because the naming changed over time and users have
 * images on disk under all of them. We look for the older directories first
 * so existing downloads keep being reused.
 */
// Wheels are identified the same way under every scheme; only the vehicle
// fields changed over time.
const PLATISCA_FIELDS = ['znamka', 'sirina', 'col', 'vijakov', 'premer', 'ET'];

const VEHICLE_FIELDS = {
  simple: ['znamkavozila', 'modelvozila', 'letoReg'],
  legacyV3: ['znamkavozila', 'modelvozila', 'prevozenikm', 'letoReg'],
  legacyV2: ['znamkavozila', 'modelvozila', 'prevozenikm', 'tipvozila', 'letoReg', 'cena'],
  legacyV1: ['znamkavozila', 'modelvozila', 'prevozenikm', 'tipvozila', 'letoReg'],
};

type Scheme = keyof typeof VEHICLE_FIELDS;

const sanitize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\s/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '');

/** The "simple" scheme concatenates values only; the legacy ones prefix names. */
function hash(fields: CarField[], adType: AdType, scheme: Scheme, includeName: boolean): string {
  const relevant = adType === 'platisca' ? PLATISCA_FIELDS : VEHICLE_FIELDS[scheme];
  let out = '';
  for (const field of fields) {
    if (!relevant.includes(field.name)) continue;
    out += includeName ? field.name + String(field.value) : String(field.value);
  }
  return sanitize(out);
}

/**
 * Written beside an ad's photos so the photo editor can name it properly
 * rather than unpicking the directory name.
 */
const METADATA_FILE = 'ad.json';

export interface AdImagesMetadata {
  adId?: string;
  adType?: AdType;
  brand?: string;
  model?: string;
  year?: string;
  km?: string;
  savedAt?: string;
}

export function writeAdImagesMetadata(setDir: string, metadata: AdImagesMetadata): void {
  try {
    fs.writeFileSync(path.join(setDir, METADATA_FILE), JSON.stringify(metadata, null, 2));
  } catch {
    /* the photos matter, the label does not */
  }
}

export function readAdImagesMetadata(setDir: string): AdImagesMetadata | null {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(setDir, METADATA_FILE), 'utf8'),
    ) as AdImagesMetadata;
  } catch {
    return null;
  }
}

export function getAdImagesDirectory(
  fields: CarField[],
  userDataPath: string,
  adType: AdType,
): string {
  const dirFor = (scheme: Scheme, includeName: boolean): string =>
    path.join(userDataPath, 'AdImages', hash(fields, adType, scheme, includeName));

  const legacyV3 = dirFor('legacyV3', true);
  const legacyV2 = dirFor('legacyV2', true);
  const legacyV1 = dirFor('legacyV1', true);
  const simple = dirFor('simple', false);

  // Existing directories win, oldest scheme first, so photos already on disk
  // are reused instead of re-downloaded.
  if (fs.existsSync(legacyV3)) return legacyV3;
  if (fs.existsSync(legacyV2)) return legacyV2;
  if (fs.existsSync(legacyV1)) return legacyV1;
  if (fs.existsSync(simple)) return simple;

  return legacyV3;
}
