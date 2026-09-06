import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { BrowserStatus } from '@shared/types';

interface BrowserValue {
  status: BrowserStatus | null;
  checking: boolean;
  error: string | null;
  /** Re-runs the session check; `reseed` first replaces our profile copy. */
  check: (reseed?: boolean) => Promise<void>;
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

  /**
   * Only one check may be in flight.
   *
   * Two overlapping checks each see a closed debug port, each start their own
   * Chrome, and then one closes the browser out from under the other — which
   * surfaces as "Navigating frame was detached". StrictMode double-invokes
   * this effect in development, and an impatient double-click does the same in
   * production, so callers share the running promise instead.
   */
  const inFlight = useRef<Promise<void> | null>(null);

  const check = useCallback(async (reseed = false): Promise<void> => {
    if (inFlight.current) return inFlight.current;

    setChecking(true);
    setError(null);

    const run = (async (): Promise<void> => {
      try {
        setStatus(
          reseed ? await window.api.reseedBrowserProfile() : await window.api.checkBrowserSession(),
        );
      } catch (e) {
        setStatus(null);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setChecking(false);
        inFlight.current = null;
      }
    })();

    inFlight.current = run;
    return run;
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  const value = useMemo<BrowserValue>(
    () => ({ status, checking, error, check }),
    [status, checking, error, check],
  );

  return <BrowserContext.Provider value={value}>{children}</BrowserContext.Provider>;
}

export function useBrowser(): BrowserValue {
  const ctx = useContext(BrowserContext);
  if (!ctx) throw new Error('useBrowser must be used inside BrowserProvider');
  return ctx;
}
