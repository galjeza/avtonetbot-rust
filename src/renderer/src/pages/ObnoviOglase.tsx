import { useCallback, useEffect, useState } from 'react';
import { CircleAlert, RefreshCw } from 'lucide-react';

import type { ActiveAd } from '@shared/types';
import { AdTable } from '@/components/renew/ad-table';
import { ReadinessGate } from '@/components/renew/readiness-gate';
import { RenewProgressCard } from '@/components/renew/renew-progress-card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useReadiness } from '@/lib/readiness';
import { useRenew } from '@/lib/renew';

/** Roughly two minutes of work per ad, on top of the waiting between them. */
const MINUTES_PER_AD = 2;

/**
 * How long a batch will take.
 *
 * The pause falls *between* ads, so a run of n ads waits n-1 times — counting
 * one per ad overstated a default run by a full hour.
 */
const estimateMinutes = (count: number, pause: number): number =>
  count === 0 ? 0 : count * MINUTES_PER_AD + (count - 1) * pause;

function LoadingPage(): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-24" />
      <Skeleton className="h-64" />
    </div>
  );
}

export default function ObnoviOglase(): JSX.Element {
  const { checks, ready, pending } = useReadiness();
  const { running, progress, error, start, dismissError } = useRenew();

  const [ads, setAds] = useState<ActiveAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pause, setPause] = useState(60);
  const [testMode, setTestMode] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setLoadError(null);
    try {
      const fetched = await window.api.getAds();
      setAds(fetched.slice().reverse());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Renewal deletes the original ad, so nothing here runs — not even the
    // listing — until every precondition holds. Depends on `ready` alone:
    // including `pending` would re-run this whenever a check restarts, which
    // would fetch the list a second time.
    if (ready) load();
  }, [ready, load]);

  const toggle = (adId: string): void => {
    const next = new Set(selected);
    if (next.has(adId)) next.delete(adId);
    else next.add(adId);
    setSelected(next);
  };

  if (pending) return <LoadingPage />;
  if (!ready) return <ReadinessGate checks={checks} />;

  if (running || progress) {
    return (
      <RenewProgressCard
        running={running}
        progress={progress}
        error={error}
        total={selected.size}
        onBack={() => {
          dismissError();
          setSelected(new Set());
          load();
        }}
      />
    );
  }

  if (loading) return <LoadingPage />;

  if (loadError) {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <CircleAlert />
        <AlertTitle>Oglasov ni bilo mogoče naložiti</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3">
          <span>{loadError}</span>
          <Button size="sm" variant="outline" onClick={load}>
            Poskusi znova
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Nastavitve obnavljanja</CardTitle>
          <CardDescription>
            Med oglasi počakamo, da obnove ne potekajo v enakomernem ritmu.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-6">
          <div className="grid w-40 gap-2">
            <Label htmlFor="pause">Pavza med oglasi (min)</Label>
            <Input
              id="pause"
              type="number"
              min={0}
              value={pause}
              onChange={(e) => setPause(Number(e.target.value))}
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch id="test" checked={testMode} onCheckedChange={setTestMode} />
            <Label htmlFor="test" className="font-normal">
              Testni način — starega oglasa ne izbriše
            </Label>
          </div>
        </CardContent>
        <CardFooter className="flex-wrap items-center gap-4">
          <Button
            disabled={selected.size === 0}
            onClick={() =>
              start(
                ads.filter((ad) => selected.has(ad.adId)),
                pause,
                testMode,
              )
            }
          >
            <RefreshCw />
            Obnovi izbrane ({selected.size})
          </Button>
          {selected.size > 0 && (
            <span className="text-muted-foreground text-sm">
              Predviden čas približno {estimateMinutes(selected.size, pause)} minut
            </span>
          )}
        </CardFooter>
      </Card>

      {ads.length === 0 ? (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>Ni oglasov za obnovo</CardTitle>
            <CardDescription>
              Pod vašo številko posrednika nismo našli aktivnih oglasov.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button variant="outline" onClick={load}>
              Naloži znova
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <AdTable
          ads={ads}
          selected={selected}
          onToggle={toggle}
          onToggleAll={(checked) =>
            setSelected(checked ? new Set(ads.map((ad) => ad.adId)) : new Set())
          }
        />
      )}
    </div>
  );
}
