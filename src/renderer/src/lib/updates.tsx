import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface UpdateValue {
  updateAvailable: boolean;
  checking: boolean;
}

const UpdateContext = createContext<UpdateValue | null>(null);

/**
 * The main process asks GitHub once at startup and flips its flag whenever the
 * answer arrives, which is usually a few seconds after this window opens.
 * Polling is how the renderer notices that, and how it notices an update that
 * appears while the app is left running all day.
 */
const POLL_MS = 60_000;

/**
 * Whether a newer version is waiting to be installed.
 *
 * Renewal is blocked while one is: a released fix is almost always a fix to
 * the renewal flow itself, and avto.net changes underneath us often enough
 * that running a known-stale version against it risks mangling real ads.
 */
export function UpdateProvider({ children }: { children: ReactNode }): JSX.Element {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [checking, setChecking] = useState(true);

  const read = useCallback(async (): Promise<void> => {
    try {
      setUpdateAvailable(await window.api.checkUpdateStatus());
    } catch {
      // An updater that cannot be reached must not lock the user out of their
      // own ads, so an unanswerable question counts as "no update".
      setUpdateAvailable(false);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    read();
    const id = setInterval(read, POLL_MS);
    return () => clearInterval(id);
  }, [read]);

  const value = useMemo<UpdateValue>(
    () => ({ updateAvailable, checking }),
    [updateAvailable, checking],
  );

  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>;
}

export function useUpdate(): UpdateValue {
  const ctx = useContext(UpdateContext);
  if (!ctx) throw new Error('useUpdate must be used inside UpdateProvider');
  return ctx;
}
