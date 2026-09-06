import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { ActiveAd, RenewProgress } from '@shared/types';

interface RenewValue {
  running: boolean;
  progress: RenewProgress | null;
  error: string | null;
  start: (ads: ActiveAd[], pause: number, testMode: boolean) => Promise<void>;
  dismissError: () => void;
}

const RenewContext = createContext<RenewValue | null>(null);

/**
 * A batch can run for hours, so its state lives above the page. Navigating to
 * the configuration and back must not lose sight of a job that is still going.
 */
export function RenewProvider({ children }: { children: ReactNode }): JSX.Element {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<RenewProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => window.api.onRenewProgress(setProgress), []);

  const start = useCallback(
    async (ads: ActiveAd[], pause: number, testMode: boolean): Promise<void> => {
      setRunning(true);
      setError(null);
      setProgress(null);
      try {
        await window.api.renewAds(ads, pause, testMode);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setRunning(false);
      }
    },
    [],
  );

  const value = useMemo<RenewValue>(
    () => ({ running, progress, error, start, dismissError: () => setError(null) }),
    [running, progress, error, start],
  );

  return <RenewContext.Provider value={value}>{children}</RenewContext.Provider>;
}

export function useRenew(): RenewValue {
  const ctx = useContext(RenewContext);
  if (!ctx) throw new Error('useRenew must be used inside RenewProvider');
  return ctx;
}
