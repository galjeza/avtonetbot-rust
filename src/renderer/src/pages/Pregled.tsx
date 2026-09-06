import { useState } from 'react';
import { CheckCircle2, CircleAlert, Globe, Mail, RefreshCw, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import type { BrowserStatus } from '@shared/types';
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

export default function Pregled(): JSX.Element {
  const { user, subscription, loading } = useAccount();
  const [browser, setBrowser] = useState<BrowserStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const checkBrowser = async (reseed: boolean): Promise<void> => {
    setBusy(true);
    try {
      const status = reseed
        ? await window.api.reseedBrowserProfile()
        : await window.api.checkBrowserSession();
      setBrowser(status);
      if (status.loggedIn) {
        toast.success('Brskalnik je prijavljen v avto.net.');
      } else {
        toast.warning('Brskalnik ni prijavljen v avto.net.');
      }
    } catch (e) {
      toast.error('Brskalnika ni bilo mogoče preveriti.', {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
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

  const blocked = !subscription.isActive;

  return (
    <div className="flex flex-col gap-6">
      {blocked && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Obnavljanje ni na voljo</AlertTitle>
          <AlertDescription>
            Vaša naročnina je potekla. Ko jo podaljšate, se stanje osveži samodejno.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Račun</CardDescription>
            <CardTitle className="text-lg break-all">{user.email}</CardTitle>
            <CardAction>
              <Mail className="text-muted-foreground size-4" />
            </CardAction>
          </CardHeader>
          <CardContent className="text-muted-foreground flex items-center gap-2 text-sm">
            <User className="size-4" />
            {user.brokerId ? `Posrednik št. ${user.brokerId}` : 'Številka posrednika ni znana'}
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
          <CardContent className="text-muted-foreground text-sm">
            {subscription.isActive
              ? 'Obnavljanje oglasov je omogočeno.'
              : 'Za obnavljanje potrebujete aktivno naročnino.'}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Brskalnik</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg">
              {browser === null ? (
                'Ni preverjeno'
              ) : browser.loggedIn ? (
                <>
                  <CheckCircle2 className="size-4" /> Prijavljen
                </>
              ) : (
                <>
                  <CircleAlert className="size-4" /> Ni prijavljen
                </>
              )}
            </CardTitle>
            <CardAction>
              <Globe className="text-muted-foreground size-4" />
            </CardAction>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Program uporablja kopijo vašega Chrome profila, da ostane prijavljen v avto.net.
          </CardContent>
          <CardFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => checkBrowser(false)} disabled={busy}>
              {busy ? <RefreshCw className="animate-spin" /> : <RefreshCw />}
              Preveri
            </Button>
            <Button variant="ghost" size="sm" onClick={() => checkBrowser(true)} disabled={busy}>
              Osveži profil
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
