import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import type { UserData } from '@shared/types';
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
import { useAccount } from '@/lib/account';

export default function Konfiguracija(): JSX.Element {
  const { user, save } = useAccount();
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
    <form onSubmit={onSubmit} className="max-w-xl">
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
  );
}
