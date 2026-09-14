import type { AdType } from '@shared/types';

export const AVTONET_EDIT_PREFIX = 'https://www.avto.net/_2016mojavtonet/ad_edit.asp?id=';

export const AVTONET_IMAGES_PREFIX = 'https://www.avto.net/_2016mojavtonet/ad_photos_edit.asp?id=';

export const AVTONET_DELETE_PREFIX = 'https://www.avto.net/_2016mojavtonet/ad_delete.asp?id=';

export const LOGIN_URL = 'https://www.avto.net/_2016mojavtonet/';
export const LOGIN_SUCCESS_URL = 'https://www.avto.net/_2016mojavtonet/welcome.asp';

/**
 * Results pages filtered to one broker; the broker id is appended.
 *
 * Deliberately down to the two parameters that carry meaning. These used to be
 * a full copy of avto.net's search form — sixty parameters, including the
 * positional EQ* equipment masks. avto.net has since added EQ10-EQ12 and
 * widened EQ8 from nine digits to ten, and a mask of the wrong width does not
 * fail: it shifts, so every digit lands on the wrong feature and quietly
 * filters ads out. One broker's cars came back as zero results that way, while
 * another broker's list was unaffected, because it only excludes ads carrying
 * the flags the shifted digits happen to hit.
 *
 * Everything omitted here is a default avto.net fills in itself. Do not paste
 * a fresh copy of the form back in — a captured snapshot only starts rotting
 * again. KAT is the category and arhiv=0 keeps archived ads out, since those
 * cannot be renewed.
 */
export const AVTONET_URLS: Record<AdType, string> = {
  car: 'https://www.avto.net/Ads/results.asp?KAT=1010000000&arhiv=0&broker=',
  dostavna: 'https://www.avto.net/Ads/results.asp?KAT=1020000000&arhiv=0&broker=',
  platisca: 'https://www.avto.net/Ads/results.asp?KAT=1100000000&arhiv=0&broker=',
};

export const newAdUrl = (adType: AdType): string => {
  switch (adType) {
    case 'car':
      return 'https://www.avto.net/_2016mojavtonet/ad_select_rubric_icons.asp?SID=10000';
    case 'dostavna':
      return 'https://www.avto.net/_2016mojavtonet/ad_insert_car_step1.asp?SID=20000';
    case 'platisca':
      return 'https://www.avto.net/_2016mojavtonet/ad_select_rubric_continue.asp?KodaRubrike=R10KAT1010';
    default:
      throw new Error(`Nepodprta vrsta oglasa: ${adType}`);
  }
};

export const SLOW_TIMEOUT_MS = 15 * 60 * 1000;
export const DEFAULT_TIMEOUT_MS = 60 * 1000;
