import { Button } from "@heroui/react";

import type { Config, UserMeta } from "../lib/api";
import { formatDate, type Subscription } from "../lib/subscription";

interface Props {
  config: Config;
  meta: UserMeta | null;
  subscription: Subscription;
  error: string | null;
  onConfigure: () => void;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-border py-3 last:border-b-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

export default function Pregled({
  config,
  meta,
  subscription,
  error,
  onConfigure,
}: Props) {
  if (!config.email) {
    return (
      <section>
        <h1 className="text-xl font-semibold tracking-tight">Pregled</h1>
        <p className="mt-3 max-w-prose text-sm text-muted">
          Vnesite e-pošto, s katero ste naročeni, in preverili bomo vašo
          naročnino.
        </p>
        <Button className="mt-5" onPress={onConfigure}>
          Odpri konfiguracijo
        </Button>
      </section>
    );
  }

  const brokerId = meta?.brokerId;

  return (
    <section>
      <h1 className="text-xl font-semibold tracking-tight">Pregled</h1>

      {error && (
        <p className="mt-4 rounded-md border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <dl className="mt-6 border-t border-border">
        <Row label="E-pošta" value={config.email} />
        <Row
          label="Naročnina do"
          value={subscription.paidTo ? formatDate(subscription.paidTo) : "Ni podatka"}
        />
        <Row
          label="Stanje"
          value={subscription.isActive ? "Aktivna" : "Ni aktivna"}
        />
        {brokerId !== null && brokerId !== undefined && (
          <Row label="Št. posrednika" value={String(brokerId)} />
        )}
      </dl>
    </section>
  );
}
