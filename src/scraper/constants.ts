import type { AdType } from '@shared/types';

export const AVTONET_EDIT_PREFIX =
  'https://www.avto.net/_2016mojavtonet/ad_edit.asp?id=';

export const AVTONET_IMAGES_PREFIX =
  'https://www.avto.net/_2016mojavtonet/ad_photos_edit.asp?id=';

export const AVTONET_DELETE_PREFIX =
  'https://www.avto.net/_2016mojavtonet/ad_delete.asp?id=';

export const LOGIN_URL = 'https://www.avto.net/_2016mojavtonet/';
export const LOGIN_SUCCESS_URL =
  'https://www.avto.net/_2016mojavtonet/welcome.asp';

/** Results pages filtered to one broker; the broker id is appended. */
export const AVTONET_URLS: Record<AdType, string> = {
  car: 'https://www.avto.net/Ads/results.asp?znamka=&model=&modelID=&tip=&znamka2=&model2=&tip2=&znamka3=&model3=&tip3=&cenaMin=0&cenaMax=999999&letnikMin=0&letnikMax=2090&bencin=0&starost2=999&oblika=0&ccmMin=0&ccmMax=99999&mocMin=0&mocMax=999999&kmMin=0&kmMax=9999999&kwMin=0&kwMax=999999&motortakt=0&motorvalji=0&lokacija=0&sirina=0&dolzina=&dolzinaMIN=0&dolzinaMAX=100&nosilnostMIN=0&nosilnostMAX=999999&lezisc=&presek=0&premer=0&col=0&vijakov=0&EToznaka=0&vozilo=&airbag=&barva=&barvaint=&EQ1=1000000000&EQ2=1000000000&EQ3=1000000000&EQ4=100000000&EQ5=1000000000&EQ6=1000001000&EQ7=1110100120&EQ8=101000000&EQ9=1000000000&KAT=1010000000&PIA=&PIAzero=&PIAOut=&PSLO=&akcija=0&paketgarancije=&prikazkategorije=0&kategorija=0&ONLvid=0&ONLnak=0&zaloga=10&arhiv=0&presort=3&tipsort=DESC&stran=1&subSORT=3&subTIPSORT=ASC&broker=',
  dostavna:
    'https://www.avto.net/Ads/results.asp?znamka=&model=&modelID=&tip=&znamka2=&model2=&tip2=&znamka3=&model3=&tip3=&cenaMin=0&cenaMax=999999&letnikMin=0&letnikMax=2090&bencin=0&starost2=999&oblika=0&ccmMin=0&ccmMax=99999&mocMin=0&mocMax=999999&kmMin=0&kmMax=9999999&kwMin=0&kwMax=999999&motortakt=0&motorvalji=0&lokacija=0&sirina=0&dolzina=&dolzinaMIN=0&dolzinaMAX=100&nosilnostMIN=0&nosilnostMAX=999999&sedezevMIN=0&sedezevMAX=9&lezisc=&presek=0&premer=0&col=0&vijakov=0&EToznaka=0&vozilo=&airbag=&barva=&barvaint=&doseg=0&EQ1=1000000000&EQ2=1000000000&EQ3=1000000000&EQ4=100000000&EQ5=1000000000&EQ6=1000001000&EQ7=1110100120&EQ8=101000000&EQ9=1000000020&KAT=1020000000&PIA=&PIAzero=&PIAOut=&PSLO=&akcija=0&paketgarancije=&broker=',
  platisca:
    'https://www.avto.net/Ads/results.asp?znamka=&model=&modelID=&tip=&znamka2=&model2=&tip2=&znamka3=&model3=&tip3=&cenaMin=0&cenaMax=999999&letnikMin=0&letnikMax=2090&bencin=0&starost2=999&oblika=0&ccmMin=0&ccmMax=99999&mocMin=0&mocMax=999999&kmMin=0&kmMax=9999999&kwMin=0&kwMax=999999&motortakt=0&motorvalji=0&lokacija=0&sirina=0&dolzina=&dolzinaMIN=0&dolzinaMAX=100&nosilnostMIN=0&nosilnostMAX=999999&sedezevMIN=0&sedezevMAX=9&lezisc=&presek=0&premer=0&col=0&vijakov=0&EToznaka=0&vozilo=0&airbag=&barva=&barvaint=&doseg=0&BkType=0&BkOkvir=0&BkOkvirType=0&Bk4=0&EQ1=1000000000&EQ2=1000000000&EQ3=1000000000&EQ4=100000000&EQ5=1000000000&EQ6=1000001000&EQ7=1110100122&EQ8=101000000&EQ9=1000000020&EQ10=100000000&KAT=1100000000&PIA=&PIAzero=&PIAOut=&PSLO=&akcija=0&paketgarancije=&broker=',
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
