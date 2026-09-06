import fs from 'node:fs';
import path from 'node:path';

import type { AdType } from '@shared/types';

export interface CarField {
  name: string;
  value: string | string[] | null;
}

/**
 * Directory name for an ad's photos, derived from a few identifying fields.
 *
 * Four schemes exist because the naming changed over time and users have
 * images on disk under all of them. We look for the older directories first
 * so existing downloads keep being reused.
 */
const RELEVANT: Record<string, Record<'platisca' | 'other', string[]>> = {
  simple: {
    platisca: ['znamka', 'sirina', 'col', 'vijakov', 'premer', 'ET'],
    other: ['znamkavozila', 'modelvozila', 'letoReg'],
  },
  legacyV3: {
    platisca: ['znamka', 'sirina', 'col', 'vijakov', 'premer', 'ET'],
    other: ['znamkavozila', 'modelvozila', 'prevozenikm', 'letoReg'],
  },
  legacyV2: {
    platisca: ['znamka', 'sirina', 'col', 'vijakov', 'premer', 'ET'],
    other: ['znamkavozila', 'modelvozila', 'prevozenikm', 'tipvozila', 'letoReg', 'cena'],
  },
  legacyV1: {
    platisca: ['znamka', 'sirina', 'col', 'vijakov', 'premer', 'ET'],
    other: ['znamkavozila', 'modelvozila', 'prevozenikm', 'tipvozila', 'letoReg'],
  },
};

const sanitize = (value: string): string =>
  value.toLowerCase().replace(/\s/g, '_').replace(/[^a-zA-Z0-9_]/g, '');

/** The "simple" scheme concatenates values only; the legacy ones prefix names. */
function hash(
  fields: CarField[],
  adType: AdType,
  scheme: keyof typeof RELEVANT,
  includeName: boolean,
): string {
  const relevant = RELEVANT[scheme][adType === 'platisca' ? 'platisca' : 'other'];
  let out = '';
  for (const field of fields) {
    if (!relevant.includes(field.name)) continue;
    out += includeName ? field.name + String(field.value) : String(field.value);
  }
  return sanitize(out);
}

export const generateAdHashSimple = (f: CarField[], t: AdType): string =>
  hash(f, t, 'simple', false);
export const generateAdHashLegacyV3 = (f: CarField[], t: AdType): string =>
  hash(f, t, 'legacyV3', true);
export const generateAdHashLegacyV2 = (f: CarField[], t: AdType): string =>
  hash(f, t, 'legacyV2', true);
export const generateAdHashLegacyV1 = (f: CarField[], t: AdType): string =>
  hash(f, t, 'legacyV1', true);

export function getAdImagesDirectory(
  fields: CarField[],
  userDataPath: string,
  adType: AdType,
): string {
  const dirFor = (h: string): string => path.join(userDataPath, 'AdImages', h);

  const legacyV3 = dirFor(generateAdHashLegacyV3(fields, adType));
  const legacyV2 = dirFor(generateAdHashLegacyV2(fields, adType));
  const legacyV1 = dirFor(generateAdHashLegacyV1(fields, adType));
  const simple = dirFor(generateAdHashSimple(fields, adType));

  // Existing directories win, oldest scheme first, so photos already on disk
  // are reused instead of re-downloaded.
  if (fs.existsSync(legacyV3)) return legacyV3;
  if (fs.existsSync(legacyV2)) return legacyV2;
  if (fs.existsSync(legacyV1)) return legacyV1;
  if (fs.existsSync(simple)) return simple;

  return legacyV3;
}
