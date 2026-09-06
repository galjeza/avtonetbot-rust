import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { UserData, UserMeta } from '@shared/types';

import { USER_API } from '../config';

export interface Subscription {
  paidTo: Date | null;
  isActive: boolean;
}

interface AccountValue {
  user: UserData | null;
  subscription: Subscription;
  loading: boolean;
  save: (user: UserData) => Promise<void>;
  refresh: () => Promise<void>;
}

const AccountContext = createContext<AccountValue | null>(null);

/** The server answers 200 with a null body for an address it does not know. */
async function fetchUserMeta(email: string): Promise<UserMeta | null> {
  try {
    const response = await fetch(`${USER_API}?email=${encodeURIComponent(email)}`);
    if (!response.ok) return null;
    return (await response.json()) as UserMeta | null;
  } catch {
    return null;
  }
}

function readSubscription(user: UserData | null): Subscription {
  if (!user?.subscriptionPaidTo) return { paidTo: null, isActive: false };
  const paidTo = new Date(user.subscriptionPaidTo);
  if (Number.isNaN(paidTo.getTime())) return { paidTo: null, isActive: false };
  return { paidTo, isActive: paidTo > new Date() };
}

/**
 * Account details and subscription state, shared by the sidebar and the
 * overview so both always agree and the licence server is queried once.
 */
export function AccountProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (): Promise<void> => {
    const stored = window.api.store.get('userData') as UserData | undefined;
    if (!stored?.email) {
      setUser(stored ?? null);
      setLoading(false);
      return;
    }

    const meta = await fetchUserMeta(stored.email);
    const merged: UserData = {
      ...stored,
      subscriptionPaidTo: meta?.subscriptionPaidTo,
      brokerId: meta?.brokerId,
      hdImages: meta?.hdImages ?? false,
    };

    setUser(merged);
    await window.api.saveUserData(merged);
    setLoading(false);
  }, []);

  const save = useCallback(
    async (next: UserData): Promise<void> => {
      await window.api.saveUserData(next);
      setUser(next);
      await refresh();
    },
    [refresh],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo<AccountValue>(
    () => ({ user, subscription: readSubscription(user), loading, save, refresh }),
    [user, loading, save, refresh],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountValue {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error('useAccount must be used inside AccountProvider');
  return ctx;
}

export const formatDate = (date: Date): string =>
  date.toLocaleDateString('sl-SI', { day: 'numeric', month: 'long', year: 'numeric' });
