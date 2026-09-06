import { FolderOpen } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function SlikeOglasov(): JSX.Element {
  const open = async (): Promise<void> => {
    const result = await window.api.openAdImagesFolder();
    if (!result.ok) {
      toast.error('Mape ni bilo mogoče odpreti.', { description: result.error });
    }
  };

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Slike oglasov</CardTitle>
        <CardDescription>
          Fotografije prenesemo enkrat in jih pri naslednjih obnovah ponovno uporabimo. Če jih
          zamenjate v tej mapi, bo obnovljen oglas uporabil nove.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        Vsak oglas ima svojo podmapo. Datoteke so oštevilčene po vrstnem redu prikaza.
      </CardContent>
      <CardFooter>
        <Button onClick={open}>
          <FolderOpen />
          Odpri mapo s slikami
        </Button>
      </CardFooter>
    </Card>
  );
}
