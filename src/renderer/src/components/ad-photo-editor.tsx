import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, FolderOpen, ImagePlus, Loader2, Repeat2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from 'cn';

import type { AdImageSet, AdPhoto } from '@shared/types';
import { Button } from '@/components/ui/button';

/**
 * Reorders a list by moving one entry to another index.
 *
 * Splicing the item out before inserting it means the target index is read
 * against the shortened list, which is what makes dropping an item to the
 * right of where it started land where the cursor is rather than one short.
 */
function move<T>(items: T[], from: number, to: number): T[] {
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Edits the photos of one ad: their order, which of them there are, and what
 * each one is.
 *
 * Every change is written to disk immediately rather than collected behind a
 * save button. The files *are* the state — the upload step reads the directory
 * straight off disk — so a half-applied edit sitting in the page would be a
 * second version of the truth with no way to reconcile it.
 */
export function AdPhotoEditor({
  set,
  onBack,
}: {
  set: AdImageSet;
  onBack: () => void;
}): JSX.Element {
  const [photos, setPhotos] = useState<AdPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  useEffect(() => {
    window.api
      .readAdImages(set.dir)
      .then(setPhotos)
      .catch(() => toast.error('Fotografij ni bilo mogoče prebrati.'))
      .finally(() => setLoading(false));
  }, [set.dir]);

  /** Runs one edit, keeping the grid from being touched while it is in flight. */
  const edit = useCallback(
    async (apply: () => Promise<AdPhoto[]>, failure: string): Promise<void> => {
      setBusy(true);
      try {
        setPhotos(await apply());
      } catch (e) {
        toast.error(failure, { description: e instanceof Error ? e.message : String(e) });
        // The failed operation may have got part way, so take disk's word for it.
        setPhotos(await window.api.readAdImages(set.dir).catch(() => photos));
      } finally {
        setBusy(false);
      }
    },
    [set.dir, photos],
  );

  const commitOrder = (ordered: AdPhoto[]): Promise<void> =>
    edit(
      () =>
        window.api.applyAdImageOrder(
          set.dir,
          ordered.map((photo) => photo.file),
        ),
      'Vrstnega reda ni bilo mogoče shraniti.',
    );

  const remove = (photo: AdPhoto): Promise<void> => {
    if (photos.length === 1) {
      toast.error('Oglas mora obdržati vsaj eno fotografijo.');
      return Promise.resolve();
    }
    return commitOrder(photos.filter((item) => item.file !== photo.file));
  };

  const drop = (to: number): void => {
    const from = dragging;
    setDragging(null);
    setOver(null);
    if (from === null || from === to) return;
    void commitOrder(move(photos, from, to));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft />
          Nazaj
        </Button>

        <div className="mr-auto min-w-0">
          <h2 className="truncate text-lg font-semibold">{set.title}</h2>
          <p className="text-muted-foreground text-sm">
            {photos.length} {photos.length === 1 ? 'fotografija' : 'fotografij'}
            {set.subtitle && ` · ${set.subtitle}`}
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() =>
            edit(() => window.api.addAdImages(set.dir), 'Fotografij ni bilo mogoče dodati.')
          }
        >
          <ImagePlus />
          Dodaj
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => window.api.openAdImageSetFolder(set.dir)}
          title="Odpri mapo te serije"
        >
          <FolderOpen />
        </Button>
      </div>

      <p className="text-muted-foreground text-sm">
        Fotografije povlecite, da spremenite vrstni red — prva je naslovna. Spremembe se shranijo
        takoj.
      </p>

      {loading ? (
        <span className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Berem fotografije…
        </span>
      ) : (
        <div
          className={cn(
            'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4',
            busy && 'pointer-events-none opacity-60',
          )}
        >
          {photos.map((photo, index) => (
            <figure
              key={photo.file}
              draggable
              onDragStart={() => setDragging(index)}
              onDragEnd={() => {
                setDragging(null);
                setOver(null);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setOver(index);
              }}
              onDrop={() => drop(index)}
              className={cn(
                'bg-card group relative overflow-hidden rounded-lg border',
                dragging === index && 'opacity-40',
                over === index && dragging !== index && 'border-primary',
              )}
            >
              <img
                src={photo.url}
                alt={`Fotografija ${index + 1}`}
                className="aspect-4/3 w-full cursor-grab object-cover active:cursor-grabbing"
                draggable={false}
              />

              <figcaption className="absolute top-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white">
                {index === 0 ? 'Naslovna' : index + 1}
              </figcaption>

              <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/70 to-transparent p-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  title="Zamenjaj s svojo datoteko"
                  onClick={() =>
                    edit(
                      () => window.api.replaceAdImage(set.dir, photo.file),
                      'Fotografije ni bilo mogoče zamenjati.',
                    )
                  }
                >
                  <Repeat2 />
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={busy}
                  title="Odstrani"
                  onClick={() => void remove(photo)}
                >
                  <Trash2 />
                </Button>
              </div>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
