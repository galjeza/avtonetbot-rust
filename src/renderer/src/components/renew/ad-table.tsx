import { AD_TYPE_LABELS, type ActiveAd } from '@shared/types';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AD_TYPE_BADGE } from '@/lib/ad-type';

/** The broker's ads, with the ones to renew ticked. */
export function AdTable({
  ads,
  selected,
  onToggle,
  onToggleAll,
}: {
  ads: ActiveAd[];
  selected: Set<string>;
  onToggle: (adId: string) => void;
  onToggleAll: (checked: boolean) => void;
}): JSX.Element {
  const allSelected = ads.length > 0 && selected.size === ads.length;

  return (
    <Card className="overflow-hidden py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">
              <Checkbox
                checked={allSelected}
                aria-label="Izberi vse"
                onCheckedChange={(checked) => onToggleAll(checked === true)}
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
              onClick={() => onToggle(ad.adId)}
              className="cursor-pointer"
            >
              <TableCell onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={selected.has(ad.adId)}
                  onCheckedChange={() => onToggle(ad.adId)}
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
  );
}
