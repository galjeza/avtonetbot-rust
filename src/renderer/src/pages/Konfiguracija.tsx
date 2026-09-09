import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import type { UserData } from '@shared/types';
import { ChromeProfilePicker } from '@/components/chrome-profile-picker';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { useAccount } from '@/lib/account';
import { useBrowser } from '@/lib/browser';

export default function Konfiguracija(): JSX.Element {
  const { user, save } = useAccount();
  const { status, checking, signIn, awaitingLogin } = useBrowser();
  const keepBrowserOpen = user?.keepBrowserOpen ?? false;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [chromePath, setChromePath] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEmail(user?.email ?? '');
    setPassword(user?.password ?? '');
    setChromePath(user?.chromePath ?? '');
  }, [user]);

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      toast.error('Vnesite e-pošto.');
      return;
    }

    setSaving(true);
    try {
      // brokerId and subscription come from the licence server, so keep
      // whatever is already stored rather than clearing it here.
      const existing: UserData = user ?? { email: '', password: '' };
      await save({ ...existing, email: trimmed, password, chromePath });
      toast.success('Nastavitve shranjene.');
    } catch (e) {
      toast.error('Nastavitev ni bilo mogoče shraniti.', {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <form onSubmit={onSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Konfiguracija</CardTitle>
            <CardDescription>
              E-pošta se uporablja za preverjanje naročnine. Geslo potrebujemo le, kadar se seja v
              brskalniku izteče.
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-5">
            <div className="grid gap-2">
              <Label htmlFor="email">E-pošta</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ime@primer.si"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="password">Geslo za avto.net</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-muted-foreground text-xs">Shranjeno lokalno na tem računalniku.</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="chromePath">Pot do Chroma</Label>
              <Input
                id="chromePath"
                value={chromePath}
                onChange={(e) => setChromePath(e.target.value)}
                placeholder="Samodejno zaznano"
              />
              <p className="text-muted-foreground text-xs">
                Izpolnite le, če Chrome ni na običajnem mestu.
              </p>
            </div>
          </CardContent>

          <CardFooter>
            <Button type="submit" disabled={saving}>
              {saving ? 'Shranjujem…' : 'Shrani nastavitve'}
            </Button>
          </CardFooter>
        </Card>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>Chromov profil</CardTitle>
          <CardDescription>
            Program poskusi prijavo prekopirati iz Chroma, ki ga uporabljate — izberite profil, v
            katerem ste prijavljeni v avto.net. Novejši Chrome na Windowsu tega ne dovoli več, zato
            se v tem primeru enkrat prijavite v oknu, ki ga odpre gumb spodaj.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-3">
          <ChromeProfilePicker />
          <p className="text-muted-foreground text-xs">
            {awaitingLogin
              ? 'V odprtem oknu se prijavite v avto.net. Okno se zapre samo.'
              : checking
                ? 'Kopiram profil in preverjam sejo…'
                : !status?.profileDir
                  ? 'Profil še ni izbran, zato prijave še nismo prekopirali.'
                  : status.loggedIn
                    ? 'Izbrani profil je prijavljen v avto.net.'
                    : 'Izbrani profil ni prijavljen v avto.net. Prijavite se vanj v Chromu ali izberite drugega.'}
          </p>

          {status?.finalUrl && !status.loggedIn && (
            <p className="text-muted-foreground text-xs break-all">
              Preverjanje se je ustavilo na: <code>{status.finalUrl}</code>
            </p>
          )}

          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={keepBrowserOpen}
              onCheckedChange={(checked) =>
                save({
                  ...(user ?? { email: '', password: '' }),
                  keepBrowserOpen: checked === true,
                })
              }
              className="mt-0.5"
            />
            <span>
              Po preverjanju pusti Chrome odprt eno minuto
              <span className="text-muted-foreground block text-xs">
                Za iskanje napak: okno ostane na strani, ki jo je preverjanje videlo, namesto da se
                takoj zapre.
              </span>
            </span>
          </label>
        </CardContent>

        <CardFooter>
          <Button variant="outline" onClick={() => signIn()} disabled={checking}>
            Prijavi se v avto.net
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
