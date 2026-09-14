import Store from 'electron-store';

import { EMPTY_USER_DATA, type UserData } from '@shared/types';

interface Schema {
  userData?: UserData;
}

/**
 * Same store name and key the previous version used, so an existing
 * installation keeps its email, password and broker id.
 */
export const store = new Store<Schema>();

export const getUserData = (): UserData | undefined => store.get('userData');

export const setUserData = (userData: UserData): void => store.set('userData', userData);

/**
 * Changes some of what is stored and leaves the rest alone.
 *
 * Callers that only want to set one field would otherwise each have to spread
 * the current value over a hand-written empty user, which is how three copies
 * of that literal came about.
 */
export const updateUserData = (patch: Partial<UserData>): void =>
  setUserData({ ...(getUserData() ?? EMPTY_USER_DATA), ...patch });
