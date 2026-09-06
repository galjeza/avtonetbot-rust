import { useAccount } from './account';
import { useBrowser } from './browser';

export interface ReadinessCheck {
  id: 'email' | 'subscription' | 'browser';
  label: string;
  ok: boolean;
  /** What to do about it, shown when the check fails. */
  hint: string;
  to: string;
}

/**
 * The three things that must hold before an ad can be renewed. Renewal is
 * destructive — it deletes the original ad before recreating it — so the app
 * refuses to start one until all three pass.
 */
export function useReadiness(): {
  checks: ReadinessCheck[];
  ready: boolean;
  pending: boolean;
} {
  const { user, subscription, loading } = useAccount();
  const { status, checking } = useBrowser();

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
      hint: 'Prijavite se v avto.net v svojem Chromu, nato osvežite profil.',
      to: '/',
    },
  ];

  return {
    checks,
    ready: checks.every((c) => c.ok),
    pending: loading || checking,
  };
}
