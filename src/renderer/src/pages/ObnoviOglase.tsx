import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleAlert, Loader2, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';

import { AD_TYPE_LABELS, type ActiveAd } from '@shared/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AD_TYPE_BADGE } from '@/lib/ad-type';
import { useReadiness } from '@/lib/readiness';
import { useRenew } from '@/lib/renew';

export default function ObnoviOglase(): JSX.Element {
  const { checks, ready, pending } = useReadiness();
  const { running, progress, error, start, dismissError } = useRenew();

  const [ads, setAds] = useState<ActiveAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pause, setPause] = useState(60);
  const [testMode, setTestMode] = useState(false);

  const load = async (): Promise<void> => {
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
  };

  useEffect(() => {
    // Renewal deletes the original ad, so nothing here runs — not even the
    // listing — until every precondition holds.
    if (ready) load();
    else if (!pending) setLoading(false);
  }, [ready, pending]);

  const allSelected = ads.length > 0 && selected.size === ads.length;

  const toggle = (adId: string): void => {
    const next = new Set(selected);
    if (next.has(adId)) next.delete(adId);
    else next.add(adId);
    setSelected(next);
  };

  const estimate = useMemo(
    () => Math.ceil(selected.size * pause + selected.size * 2),
    [selected.size, pause],
  );

  if (pending) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!ready) {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Obnavljanje še ni mogoče</CardTitle>
          <CardDescription>
            Preden lahko obnovimo oglas, mora biti urejeno naslednje.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-3">
            {checks.map((c) => (
              <li key={c.id} className="flex items-start gap-2 text-sm">
                {c.ok ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-500" />
                ) : (
                  <CircleAlert className="text-destructive mt-0.5 size-4 shrink-0" />
                )}
                <span>
                  {c.label}
                  {!c.ok && <span className="text-muted-foreground block">{c.hint}</span>}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
        <CardFooter>
          <Button asChild>
            <Link to="/">Nazaj na pregled</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (running || progress) {
    const done = progress ? progress.index : 0;
    const total = progress?.total ?? selected.size;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;

    return (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {running && <Loader2 className="size-4 animate-spin" />}
            {running ? 'Obnavljam oglase' : 'Obnavljanje končano'}
          </CardTitle>
          <CardDescription>
            {running
              ? 'Ne zapirajte programa. Brskalnik se bo večkrat odprl in zaprl.'
              : 'Vsi izbrani oglasi so obdelani.'}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-sm">
              <span>
                Oglas {Math.min(done + 1, total)} od {total}
              </span>
              <span className="text-muted-foreground">{percent} %</span>
            </div>
            <Progress value={percent} />
          </div>

          {progress && (
            <div className="rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Trenutni korak</span>
                {progress.adType && (
                  <Badge variant="outline" className={AD_TYPE_BADGE[progress.adType]}>
                    {AD_TYPE_LABELS[progress.adType]}
                  </Badge>
                )}
              </div>
              <p className="mt-1">{progress.step}</p>
              {progress.message && <p className="text-destructive mt-1">{progress.message}</p>}
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <CircleAlert />
              <AlertTitle>Obnavljanje se je ustavilo</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>

        {!running && (
          <CardFooter>
            <Button
              onClick={() => {
                dismissError();
                setSelected(new Set());
                load();
              }}
            >
              Nazaj na seznam
            </Button>
          </CardFooter>
        )}
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }

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
                ads.filter((a) => selected.has(a.adId)),
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
              Predviden čas približno {estimate} minut
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
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={allSelected}
                    aria-label="Izberi vse"
                    onCheckedChange={(checked) =>
                      setSelected(checked ? new Set(ads.map((a) => a.adId)) : new Set())
                    }
                  />
                </TableHead>
                <TableHead className="w-20">Slika</TableHead>
                <TableHead>Oglas</TableHead>
                <TableHead>Vrsta</TableHead>
                <TableHead className="text-right">Cena</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ads.map((ad) => (
                <TableRow
                  key={ad.adId}
                  data-state={selected.has(ad.adId) ? 'selected' : undefined}
                  onClick={() => toggle(ad.adId)}
                  className="cursor-pointer"
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(ad.adId)}
                      onCheckedChange={() => toggle(ad.adId)}
                      aria-label={ad.name}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="bg-muted h-10 w-16 overflow-hidden rounded">
                      {ad.photoUrl && !ad.photoUrl.startsWith('data:') && (
                        <img
                          src={ad.photoUrl}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{ad.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={AD_TYPE_BADGE[ad.sourceType]}>
                      {AD_TYPE_LABELS[ad.sourceType]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{ad.price}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
