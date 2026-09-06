import type { AdType } from '@shared/types';

/**
 * Tint per ad category, applied on top of the outline Badge.
 *
 * Categorical, not ranked — three distinct hues of equal weight. Red and green
 * are deliberately unused here: they already mean "error" and "subscription
 * active" elsewhere in the app, and reusing them would imply a status the
 * category does not carry.
 */
export const AD_TYPE_BADGE: Record<AdType, string> = {
  car: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300',
  dostavna:
    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
  platisca:
    'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300',
};
