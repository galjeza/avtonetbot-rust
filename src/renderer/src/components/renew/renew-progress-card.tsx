import { CircleAlert, Loader2 } from 'lucide-react';

import { AD_TYPE_LABELS, type RenewProgress } from '@shared/types';
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
import { Progress } from '@/components/ui/progress';
import { AD_TYPE_BADGE } from '@/lib/ad-type';

/** How a batch is getting on, and how it ended. */
export function RenewProgressCard({
  running,
  progress,
  error,
  total,
  onBack,
}: {
  running: boolean;
  progress: RenewProgress | null;
  error: string | null;
  /** Falls back to the selection size until the first progress event arrives. */
  total: number;
  onBack: () => void;
}): JSX.Element {
  const done = progress?.index ?? 0;
  const count = progress?.total ?? total;
  const percent = count > 0 ? Math.round((done / count) * 100) : 0;

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
              Oglas {Math.min(done + 1, count)} od {count}
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
          <Button onClick={onBack}>Nazaj na seznam</Button>
        </CardFooter>
      )}
    </Card>
  );
}
