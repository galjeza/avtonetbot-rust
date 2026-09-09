import {
  CheckCircle2,
  CircleAlert,
  Download,
  Globe,
  Loader2,
  Mail,
  RefreshCw,
  User,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { ChromeProfilePicker } from '@/components/chrome-profile-picker';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, useAccount } from '@/lib/account';
import { useBrowser } from '@/lib/browser';
import { useReadiness } from '@/lib/readiness';
import { useUpdate } from '@/lib/updates';

/** Green tick shown beside a value that has passed its check. */
function Verified({ label = 'Preverjeno' }: { label?: string }): JSX.Element {
  return (
    <span className="flex items-center gap-1 text-sm font-normal text-green-600 dark:text-green-500">
      <CheckCircle2 className="size-4" />
      {label}
    </span>
  );
}

export default function Pregled(): JSX.Element {
  const { user, subscription, loading } = useAccount();
  const { status, checking, error, check, selecting } = useBrowser();
  const { checks, ready } = useReadiness();
  const { updateAvailable, checking: checkingUpdate, version } = useUpdate();

  const runCheck = async (reseed: boolean): Promise<void> => {
    await check(reseed);
    toast.dismiss();
  };

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (!user?.email) {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Začnite s konfiguracijo</CardTitle>
          <CardDescription>
            Vnesite e-pošto, s katero ste naročeni, in preverili bomo vašo naročnino.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild>
            <Link to="/konfiguracija">Odpri konfiguracijo</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const failing = checks.filter((c) => !c.ok);

  return (
    <div className="flex flex-col gap-6">
      {!ready && !checking && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Obnavljanje še ni mogoče</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {failing.map((c) => (
                <li key={c.id}>{c.hint}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Račun</CardDescription>
            <CardTitle className="text-lg break-all">{user.email}</CardTitle>
            <CardAction>
              <Mail className="text-muted-foreground size-4" />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Verified label="E-pošta je nastavljena" />
            <span className="text-muted-foreground flex items-center gap-2 text-sm">
              <User className="size-4" />
              {user.brokerId ? `Posrednik št. ${user.brokerId}` : 'Številka posrednika ni znana'}
            </span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Naročnina</CardDescription>
            <CardTitle className="text-lg">
              {subscription.paidTo ? formatDate(subscription.paidTo) : 'Ni podatka'}
            </CardTitle>
            <CardAction>
              <Badge variant={subscription.isActive ? 'default' : 'destructive'}>
                {subscription.isActive ? 'Aktivna' : 'Poteklá'}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            {subscription.isActive ? (
              <Verified label="Velja še naprej" />
            ) : (
              <span className="text-muted-foreground text-sm">
                Za obnavljanje potrebujete aktivno naročnino.
              </span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Brskalnik</CardDescription>
            <CardTitle className="text-lg">
              {checking
                ? 'Preverjam…'
                : !status?.profileDir
                  ? 'Izberite profil'
                  : status.loggedIn
                    ? 'Prijavljen'
                    : 'Ni prijavljen'}
            </CardTitle>
            <CardAction>
              <Globe className="text-muted-foreground size-4" />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {checking ? (
              <span className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" />
                {selecting
                  ? 'Kopiramo profil in preverjamo sejo.'
                  : 'Odpiramo Chrome, da preverimo sejo.'}
              </span>
            ) : status?.loggedIn ? (
              <Verified />
            ) : (
              <span className="text-muted-foreground text-sm">
                {error ??
                  (status && !status.profileDir
                    ? 'Program prijavo prekopira iz enega vaših Chromovih profilov. Izberite, iz katerega.'
                    : 'Prijavite se v avto.net v svojem Chromu, nato osvežite profil.')}
              </span>
            )}
            {!checking && status?.profileDir && !status.loggedIn && status.finalUrl && (
              <span className="text-muted-foreground text-xs break-all">
                Ustavilo se je na: {status.finalUrl}
              </span>
            )}
            <ChromeProfilePicker className="pt-1" />
          </CardContent>
          <CardFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => runCheck(false)} disabled={checking}>
              <RefreshCw className={checking ? 'animate-spin' : undefined} />
              Preveri
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => runCheck(true)}
              disabled={checking || !status?.profileDir}
            >
              Osveži profil
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Program</CardDescription>
            <CardTitle className="text-lg">{version ? `Različica ${version}` : '—'}</CardTitle>
            <CardAction>
              {updateAvailable ? (
                <Badge variant="destructive">Posodobite</Badge>
              ) : (
                <Download className="text-muted-foreground size-4" />
              )}
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {checkingUpdate ? (
              <span className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" />
                Preverjamo, ali je na voljo posodobitev.
              </span>
            ) : updateAvailable ? (
              // The install itself is driven by the dialog the main process
              // shows on launch, so the only thing left to describe is how to
              // get that dialog back after dismissing it.
              <ol className="text-muted-foreground list-inside list-decimal text-sm">
                <li>Zaprite program</li>
                <li>Zaženite ga ponovno</li>
                <li>Potrdite namestitev posodobitve</li>
              </ol>
            ) : (
              <Verified label="Program je posodobljen" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
