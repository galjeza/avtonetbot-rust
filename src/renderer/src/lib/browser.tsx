import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { BrowserStatus, ChromeProfileInfo } from '@shared/types';

interface BrowserValue {
  status: BrowserStatus | null;
  checking: boolean;
  error: string | null;
  /** Re-runs the session check; `reseed` first replaces our profile copy. */
  check: (reseed?: boolean) => Promise<void>;
  /** The user's Chrome profiles, best candidate for the session first. */
  profiles: ChromeProfileInfo[];
  /** Copies the session from the given profile, then checks it. */
  selectProfile: (profileDir: string) => Promise<void>;
  /** The profile a selection is being applied to, while it runs. */
  selecting: string | null;
  /** Opens the browser so the user can sign in to avto.net themselves. */
  signIn: () => Promise<void>;
  /** True while that window is open and waiting for them. */
  awaitingLogin: boolean;
}

const BrowserContext = createContext<BrowserValue | null>(null);

/**
 * Whether the copied Chrome profile is still signed in to avto.net.
 *
 * Checked once when the app opens so the overview can report a verified state
 * without the user having to ask for it. The check starts Chrome and closes it
 * again, so a browser window appears briefly on launch.
 */
export function BrowserProvider({ children }: { children: ReactNode }): JSX.Element {
  const [status, setStatus] = useState<BrowserStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<ChromeProfileInfo[]>([]);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [awaitingLogin, setAwaitingLogin] = useState(false);

  /** Both entry points differ only in which call produces the status. */
  const run = useCallback(async (produce: () => Promise<BrowserStatus>): Promise<void> => {
    setChecking(true);
    setError(null);
    try {
      setStatus(await produce());
    } catch (e) {
      setStatus(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  }, []);

  const check = useCallback(
    (reseed = false): Promise<void> =>
      run(reseed ? window.api.reseedBrowserProfile : window.api.checkBrowserSession),
    [run],
  );

  const selectProfile = useCallback(
    async (profileDir: string): Promise<void> => {
      setSelecting(profileDir);
      try {
        await run(() => window.api.selectChromeProfile(profileDir));
      } finally {
        setSelecting(null);
      }
    },
    [run],
  );

  const signIn = useCallback(async (): Promise<void> => {
    setAwaitingLogin(true);
    try {
      await run(window.api.signInManually);
    } finally {
      setAwaitingLogin(false);
    }
  }, [run]);

  useEffect(() => {
    check();
    // Listing reads the profile directories on disk, so it does not need the
    // browser and can settle while the session check is still running.
    window.api
      .listChromeProfiles()
      .then(setProfiles)
      .catch(() => setProfiles([]));
  }, [check]);

  const value = useMemo<BrowserValue>(
    () => ({
      status,
      checking,
      error,
      check,
      profiles,
      selectProfile,
      selecting,
      signIn,
      awaitingLogin,
    }),
    [status, checking, error, check, profiles, selectProfile, selecting, signIn, awaitingLogin],
  );

  return <BrowserContext.Provider value={value}>{children}</BrowserContext.Provider>;
}

export function useBrowser(): BrowserValue {
  const ctx = useContext(BrowserContext);
  if (!ctx) throw new Error('useBrowser must be used inside BrowserProvider');
  return ctx;
}
