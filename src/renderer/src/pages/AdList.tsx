import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AD_TYPE_LABELS, type ActiveAd } from '@shared/types';

const truncate = (str: string): string => (str.length > 35 ? `${str.slice(0, 35)}...` : str);

export default function AdList(): JSX.Element {
  const [ads, setAds] = useState<ActiveAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAds, setSelectedAds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [pause, setPause] = useState(60);
  const [testMode, setTestMode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();

  useEffect(() => {
    const getAds = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        // One list across all categories; each ad's real type is resolved
        // later, from its own edit page.
        const fetched = await window.api.getAds();
        // Newest first.
        setAds(fetched.slice().reverse());
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Napaka pri nalaganju oglasov');
      } finally {
        setLoading(false);
      }
    };
    getAds();
  }, []);

  useEffect(() => {
    setSelectedAds(selectAll ? new Set(ads.map((ad) => ad.adId)) : new Set());
  }, [selectAll, ads]);

  const handleAdSelection = (adId: string): void => {
    const next = new Set(selectedAds);
    if (next.has(adId)) next.delete(adId);
    else next.add(adId);
    setSelectedAds(next);
    setSelectAll(next.size === ads.length && ads.length > 0);
  };

  const handleSubmit = (): void => {
    const selected = ads.filter((ad) => selectedAds.has(ad.adId));
    navigate('/obnavljanje', { state: { selected, pause, testMode } });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900 text-white">
        Nalagam oglase...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900 text-white">
        <div className="w-full max-w-md rounded-lg bg-red-800 p-4 shadow-md">
          <h2 className="mb-4 text-center text-lg font-semibold">Napaka pri nalaganju oglasov</h2>
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

  return (
    <div className="flex min-h-screen flex-col items-center justify-start overflow-y-auto bg-gray-900 p-4 text-white">
      <div className="mb-4 flex w-full max-w-6xl items-center justify-between gap-4">
        <button
          type="button"
          onClick={handleSubmit}
          className="rounded-lg bg-blue-500 px-4 py-2 font-semibold text-white shadow hover:bg-blue-700"
        >
          Obnovi izbrane oglase ({selectedAds.size})
        </button>

        <label className="flex cursor-pointer items-center">
          <span className="mr-2 text-sm">Pavza med oglasi (minute)</span>
          <input
            type="number"
            min={0}
            value={pause}
            onChange={(e) => setPause(Number(e.target.value))}
            className="h-8 w-16 rounded border-2 border-gray-300 bg-gray-800 px-2"
          />
        </label>

        <label className="flex cursor-pointer items-center">
          <input
            type="checkbox"
            className="h-5 w-5 rounded border-2 border-gray-300 bg-gray-800"
            checked={selectAll}
            onChange={() => setSelectAll(!selectAll)}
          />
          <span className="ml-2 text-sm">Izberi vse</span>
        </label>

        <label className="flex cursor-pointer items-center">
          <input
            type="checkbox"
            className="h-5 w-5 rounded border-2 border-gray-300 bg-gray-800"
            checked={testMode}
            onChange={() => setTestMode(!testMode)}
          />
          <span className="ml-2 text-sm">Testni način (ne izbriši starega oglasa)</span>
        </label>
      </div>

      <div className="grid w-full max-w-6xl grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7">
        {ads.map((ad) => (
          <label
            key={ad.adId}
            className="flex cursor-pointer flex-col items-center rounded-lg bg-gray-800 p-4 text-center shadow-lg"
          >
            <img src={ad.photoUrl} alt={ad.name} className="mb-4 h-30 w-full rounded-md object-cover" />
            <p className="overflow-hidden text-sm font-bold text-ellipsis">{truncate(ad.name)}</p>
            <p className="text-sm">{ad.price}</p>
            <p className="text-xs text-gray-400">{AD_TYPE_LABELS[ad.sourceType]}</p>
            <input
              type="checkbox"
              checked={selectedAds.has(ad.adId)}
              onChange={() => handleAdSelection(ad.adId)}
              className="mt-2 h-5 w-5 rounded border-2 border-gray-300 bg-gray-700"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
