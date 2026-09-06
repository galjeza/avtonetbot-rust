import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import type { AdType, BrowserStatus, UserData, UserMeta } from '@shared/types';
import { USER_API } from '../config';

const UPDATE_POLL_MS = 60_000;

const RENEW_LINKS: Array<{ type: AdType; label: string }> = [
  { type: 'car', label: 'Obnovi avtomobile' },
  { type: 'dostavna', label: 'Obnovi dostavna vozila' },
  { type: 'platisca', label: 'Obnovi platišča' },
];

const linkClass =
  'block py-2 px-4 text-gray-200 bg-gray-800 hover:bg-gray-600 mb-2 border border-gray-600 rounded-lg transition ease-in-out duration-150';

async function fetchUserMeta(email: string): Promise<UserMeta | null> {
  try {
    const response = await fetch(`${USER_API}?email=${encodeURIComponent(email)}`);
    if (!response.ok) return null;
    // The server answers 200 with a null body for an address it does not know.
    return (await response.json()) as UserMeta | null;
  } catch {
    return null;
  }
}

export default function Menu(): JSX.Element {
  const [loading, setLoading] = useState(true);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [user, setUser] = useState<UserData | null>(null);
  const [browser, setBrowser] = useState<BrowserStatus | null>(null);
  const [browserBusy, setBrowserBusy] = useState(false);
  const [browserError, setBrowserError] = useState<string | null>(null);

  useEffect(() => {
    const check = async (): Promise<void> => {
      setUpdateAvailable(await window.api.checkUpdateStatus());
    };
    check();
    const interval = setInterval(check, UPDATE_POLL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const load = async (): Promise<void> => {
      const stored = window.api.store.get('userData') as UserData | undefined;
      if (!stored?.email) {
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
    };
    load();
  }, []);

  const checkBrowser = useCallback(async (reseed: boolean): Promise<void> => {
    setBrowserBusy(true);
    setBrowserError(null);
    try {
      setBrowser(
        reseed ? await window.api.reseedBrowserProfile() : await window.api.checkBrowserSession(),
      );
    } catch (error) {
      setBrowser(null);
      setBrowserError(error instanceof Error ? error.message : String(error));
    } finally {
      setBrowserBusy(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900 text-white">
        <p>Nalagam...</p>
      </div>
    );
  }

  const paidTo = user?.subscriptionPaidTo ? new Date(user.subscriptionPaidTo) : null;
  const isSubscriptionActive = paidTo !== null && paidTo > new Date();
  const subscriptionLabel = paidTo
    ? paidTo.toLocaleString('sl-SI', { month: 'long', day: 'numeric', year: 'numeric' })
    : '—';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900 text-white">
      <div className="w-full max-w-md rounded-lg bg-gray-800 p-4 shadow-md">
        <h2 className="mb-4 text-center text-lg font-semibold">
          Avtonet Bot - Obnavljanje oglasov
        </h2>

        {updateAvailable && (
          <div className="mb-4 rounded-lg bg-yellow-600 p-4">
            <h3 className="mb-2 font-bold">Na voljo je nova verzija programa!</h3>
            <p className="mb-2">Za posodobitev:</p>
            <ol className="list-inside list-decimal">
              <li>Zaprite program</li>
              <li>Zaženite program ponovno</li>
              <li>Potrdite namestitev posodobitve</li>
            </ol>
            <p className="mt-2 text-yellow-200">
              Obnavljanje oglasov je onemogočeno dokler ne namestite posodobitve.
            </p>
          </div>
        )}

        <div className="mb-4 rounded-lg bg-gray-700 p-4">
          <p className="mb-2">
            <span className="font-semibold">Email:</span> {user?.email ?? '—'}
          </p>
          <p className="mb-2">
            <span className="font-semibold">Naročnina aktivna do:</span> {subscriptionLabel}
          </p>
          <p>
            <span className="font-semibold">Status naročnine:</span>{' '}
            <span className={isSubscriptionActive ? 'text-green-400' : 'text-red-400'}>
              {isSubscriptionActive ? 'Aktivna' : 'Neaktivna'}
            </span>
          </p>
        </div>

        <div className="mb-4 rounded-lg bg-gray-700 p-4">
          <p className="mb-2 font-semibold">Brskalnik</p>
          <p className="mb-3 text-sm text-gray-300">
            Program uporablja kopijo vašega Chrome profila, da ostane prijavljen v avto.net.
          </p>
          {browser && (
            <p className="mb-2 text-sm">
              Prijavljen:{' '}
              <span className={browser.loggedIn ? 'text-green-400' : 'text-red-400'}>
                {browser.loggedIn ? 'Da' : 'Ne'}
              </span>
              {browser.profileSeeded && (
                <span className="text-gray-300"> — profil je bil pravkar kopiran</span>
              )}
            </p>
          )}
          {browserError && <p className="mb-2 text-sm text-red-400">{browserError}</p>}
          <button type="button" onClick={() => checkBrowser(false)} disabled={browserBusy} className={linkClass}>
            {browserBusy ? 'Preverjam...' : 'Preveri brskalnik'}
          </button>
          <button type="button" onClick={() => checkBrowser(true)} disabled={browserBusy} className={linkClass}>
            Osveži profil iz Chroma
          </button>
        </div>

        <div className="bg-gray-700 p-4">
          <Link to="/update" className={linkClass}>
            Konfiguracija
          </Link>

          <button type="button" onClick={() => window.api.openAdImagesFolder()} className={linkClass}>
            Uredi slike oglasov
          </button>

          {isSubscriptionActive && !updateAvailable ? (
            RENEW_LINKS.map(({ type, label }) => (
              <Link key={type} to="/adlist" state={{ type }} className={linkClass}>
                {label}
              </Link>
            ))
          ) : (
            <p className="text-red-400">
              {updateAvailable
                ? 'Obnova oglasov ni mogoča. Prosimo, posodobite program.'
                : 'Obnova oglasov ni mogoča saj nimate aktivne naročnine'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
