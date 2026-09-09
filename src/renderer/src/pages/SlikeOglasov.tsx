import { useCallback, useEffect, useState } from 'react';
import { FolderOpen, Images, Loader2, Pencil, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import type { AdImageSet } from '@shared/types';
import { AdPhotoEditor } from '@/components/ad-photo-editor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const formatDate = (ms: number): string =>
  ms
    ? new Date(ms).toLocaleDateString('sl-SI', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

/** One row: what the ad is, how many photos it has, and the way into them. */
function AdImageRow({ set, onEdit }: { set: AdImageSet; onEdit: () => void }): JSX.Element {
  return (
    <div className="flex items-center gap-3 border-b px-4 py-3 last:border-b-0">
      <img
        // The set is listed only when it has photos, so there is always a first
        // one. The timestamp is what makes an edited cover photo actually
        // change on screen, since the file name it is under does not.
        src={`adimg://photos/${encodeURIComponent(set.dir)}/0.jpg?v=${set.updatedAt}`}
        alt=""
        className="bg-muted size-14 shrink-0 rounded-md object-cover"
      />

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{set.title}</p>
        <p className="text-muted-foreground truncate text-sm">
          {[set.subtitle, `${set.photoCount} fotografij`, formatDate(set.updatedAt)]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      <Button variant="outline" size="sm" onClick={onEdit}>
        <Pencil />
        Uredi fotografije
      </Button>
    </div>
  );
}

export default function SlikeOglasov(): JSX.Element {
  const [sets, setSets] = useState<AdImageSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      setSets(await window.api.listAdImageSets());
    } catch (e) {
      toast.error('Seznama slik ni bilo mogoče prebrati.', {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openFolder = async (): Promise<void> => {
    const result = await window.api.openAdImagesFolder();
    if (!result.ok) toast.error('Mape ni bilo mogoče odpreti.', { description: result.error });
  };

  const editingSet = sets.find((set) => set.dir === editing);
  if (editingSet) {
    return (
      <AdPhotoEditor
        set={editingSet}
        onBack={() => {
          setEditing(null);
          // Counts and thumbnails in the list are stale after an edit.
          void load();
        }}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Slike oglasov</CardTitle>
        <CardDescription>
          Fotografije prenesemo enkrat in jih pri naslednjih obnovah ponovno uporabimo. Kar uredite
          tukaj, bo objavljeno ob naslednji obnovi.
        </CardDescription>
      </CardHeader>

      <CardContent className="p-0">
        {loading ? (
          <p className="text-muted-foreground flex items-center gap-2 px-6 py-8 text-sm">
            <Loader2 className="size-4 animate-spin" />
            Berem shranjene fotografije…
          </p>
        ) : sets.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center gap-2 px-6 py-10 text-center text-sm">
            <Images className="size-6" />
            <p>Shranjenih fotografij še ni. Prenesemo jih ob prvi obnovi oglasa.</p>
          </div>
        ) : (
          <div className="border-t">
            {sets.map((set) => (
              <AdImageRow key={set.dir} set={set} onEdit={() => setEditing(set.dir)} />
            ))}
          </div>
        )}
      </CardContent>

      <div className="flex gap-2 px-6 pb-6">
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={loading ? 'animate-spin' : undefined} />
          Osveži
        </Button>
        <Button variant="ghost" onClick={openFolder}>
          <FolderOpen />
          Odpri mapo
        </Button>
      </div>
    </Card>
  );
}
