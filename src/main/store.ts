import Store from 'electron-store';

import type { UserData } from '@shared/types';

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
