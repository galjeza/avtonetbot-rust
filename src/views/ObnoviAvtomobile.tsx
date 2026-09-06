import type { Subscription } from "../lib/subscription";

interface Props {
  subscription: Subscription;
}

export default function ObnoviAvtomobile({ subscription }: Props) {
  return (
    <section>
      <h1 className="text-xl font-semibold tracking-tight">Obnovi avtomobile</h1>

      <p className="mt-3 max-w-prose text-sm text-muted">
        {subscription.isActive
          ? "Obnavljanje oglasov še ni na voljo."
          : "Za obnovo oglasov potrebujete aktivno naročnino."}
      </p>
    </section>
  );
}
