import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import type { ActiveAd, AdType, RenewProgress } from '@shared/types';

interface RenewState {
  selected: ActiveAd[];
  pause: number;
  type: AdType;
  testMode: boolean;
}

export default function Obnavljanje(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const { selected = [], pause = 0, type, testMode = false } = (location.state ?? {}) as Partial<RenewState>;

  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<RenewProgress | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  // React 18 StrictMode mounts effects twice in development; without this the
  // batch would be kicked off two times.
  const started = useRef(false);

  useEffect(() => window.api.onRenewProgress(setProgress), []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const run = async (): Promise<void> => {
      if (await window.api.checkUpdateStatus()) {
        navigate('/');
        return;
      }
      if (selected.length === 0 || !type) {
        navigate('/');
        return;
      }

      setIsProcessing(true);
      try {
        await window.api.renewAds(selected, pause, type, testMode);
        navigate('/');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Napaka pri obnavljanju oglasov');
        setIsProcessing(false);
      }
    };

    run();
  }, [navigate, pause, selected, testMode, type]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900 text-white">
        <div className="w-full max-w-md rounded-lg bg-red-800 p-4 shadow-md">
          <h2 className="mb-4 text-center text-lg font-semibold">Napaka pri obnavljanju oglasov</h2>
          <p className="mt-4 text-center text-red-200">{error}</p>
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-700"
            >
              Nazaj na glavno stran
            </button>
          </div>
        </div>
      </div>
    );
  }

  const estimatedMinutes = Math.ceil(selected.length * pause + selected.length * 2);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900 text-white">
      <div className="w-full max-w-md rounded-lg bg-gray-800 p-4 shadow-md">
        <h2 className="mb-4 text-center text-lg font-semibold">
          {isProcessing ? 'Obnavljam oglase' : 'Pripravljam obnavljanje'}
          {testMode ? ' (Testni način)' : ''}
        </h2>

        {selected.length > 0 ? (
          <>
            <p className="mt-4 text-center">
              {isProcessing
                ? 'Obnavljam izbrane oglase. Ne zapirajte programa.'
                : 'Pripravljam obnavljanje oglasov...'}
            </p>

            {progress && (
              <div className="mt-4 rounded-lg bg-gray-700 p-3 text-center">
                <p className="font-semibold">
                  Oglas {progress.index + 1} od {progress.total}
                </p>
                <p className="text-sm text-gray-300">{progress.step}</p>
                {progress.message && <p className="mt-1 text-sm text-red-300">{progress.message}</p>}
              </div>
            )}

            <p className="mt-4 text-center">
              <span className="font-semibold">Število izbranih oglasov:</span> {selected.length}
            </p>
            <p className="mt-4 text-center">
              <span className="font-semibold">Pavza:</span> {pause} minut
            </p>
            <p className="mt-4 text-center">
              <span className="font-semibold">Pričakovan čas za obnovo vseh vozil:</span>{' '}
              {estimatedMinutes} minut
            </p>
          </>
        ) : (
          <p className="text-center">Niste izbrali nobenega oglasa.</p>
        )}
      </div>
    </div>
  );
}
