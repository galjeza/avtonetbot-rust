import { CheckCircle2, CircleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { ReadinessCheck } from '@/lib/readiness';

/**
 * What stands between the user and a renewal, listed with what to do about it.
 *
 * Shown instead of the ad list rather than beside it: renewal deletes the
 * original ad, so a half-ready state is not one to offer a button in.
 */
export function ReadinessGate({ checks }: { checks: ReadinessCheck[] }): JSX.Element {
  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Obnavljanje še ni mogoče</CardTitle>
        <CardDescription>Preden lahko obnovimo oglas, mora biti urejeno naslednje.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-3">
          {checks.map((check) => (
            <li key={check.id} className="flex items-start gap-2 text-sm">
              {check.ok ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-500" />
              ) : (
                <CircleAlert className="text-destructive mt-0.5 size-4 shrink-0" />
              )}
              <span>
                {check.label}
                {!check.ok && <span className="text-muted-foreground block">{check.hint}</span>}
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
