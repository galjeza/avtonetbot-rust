import { useAccount } from './account';
import { useBrowser } from './browser';
import { useUpdate } from './updates';

export interface ReadinessCheck {
  id: 'email' | 'subscription' | 'browser' | 'update';
  label: string;
  ok: boolean;
  /** What to do about it, shown when the check fails. */
  hint: string;
  to: string;
}

/**
 * The four things that must hold before an ad can be renewed. Renewal is
 * destructive — it deletes the original ad before recreating it — so the app
 * refuses to start one until all four pass.
 */
export function useReadiness(): {
  checks: ReadinessCheck[];
  ready: boolean;
  pending: boolean;
} {
  const { user, subscription, loading } = useAccount();
  const { status, checking } = useBrowser();
  const { updateAvailable, checking: checkingUpdate } = useUpdate();

  const checks: ReadinessCheck[] = [
    {
      id: 'email',
      label: 'E-pošta je nastavljena',
      ok: Boolean(user?.email),
      hint: 'Vnesite e-pošto, s katero ste naročeni.',
      to: '/konfiguracija',
    },
    {
      id: 'subscription',
      label: 'Naročnina je aktivna',
      ok: subscription.isActive,
      hint: 'Naročnina je potekla. Ko jo podaljšate, se stanje osveži samodejno.',
      to: '/',
    },
    {
      id: 'browser',
      label: 'Brskalnik je prijavljen v avto.net',
      ok: Boolean(status?.loggedIn),
      // Nothing is copied until a profile is picked, so telling someone in
      // that state to refresh the copy would point them at the wrong step.
      hint:
        status && !status.profileDir
          ? 'Izberite Chromov profil, iz katerega naj program prekopira prijavo.'
          : 'Prijavite se v avto.net v svojem Chromu, nato osvežite profil.',
      to: '/',
    },
    {
      id: 'update',
      label: 'Program je posodobljen',
      ok: !updateAvailable,
      hint:
        'Na voljo je nova verzija programa. Zaprite program, ga zaženite znova ' +
        'in potrdite namestitev posodobitve.',
      to: '/',
    },
  ];

  return {
    checks,
    ready: checks.every((c) => c.ok),
    pending: loading || checking || checkingUpdate,
  };
}
