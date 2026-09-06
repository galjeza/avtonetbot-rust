import { useState } from "react";
import { Button, toast } from "@heroui/react";

import { checkBrowserSession, type SessionCheck } from "../lib/api";
import type { Subscription } from "../lib/subscription";

interface Props {
  subscription: Subscription;
}

export default function ObnoviAvtomobile({ subscription }: Props) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<SessionCheck | null>(null);

  const check = async () => {
    setChecking(true);
    try {
      const check = await checkBrowserSession();
      setResult(check);
      if (check.profile_seeded) {
        toast.info("Kopirali smo vaš Chrome profil.");
      }
    } catch (e) {
      setResult(null);
      toast.danger("Brskalnika ni bilo mogoče preveriti.", {
        description: String(e),
      });
    } finally {
      setChecking(false);
    }
  };

  return (
    <section>
      <h1 className="text-xl font-semibold tracking-tight">Obnovi avtomobile</h1>

      {!subscription.isActive && (
        <p className="mt-3 max-w-prose text-sm text-muted">
          Za obnovo oglasov potrebujete aktivno naročnino.
        </p>
      )}

      <div className="mt-6 flex flex-col items-start gap-4">
        <p className="max-w-prose text-sm text-muted">
          Preverimo, ali je brskalnik prijavljen v avto.net.
        </p>

        <Button onPress={check} isDisabled={checking}>
          {checking ? "Preverjam…" : "Preveri brskalnik"}
        </Button>

        {result && (
          <dl className="w-full max-w-md border-t border-border">
            <div className="flex justify-between gap-6 border-b border-border py-3">
              <dt className="text-sm text-muted">Prijavljen</dt>
              <dd className="text-sm">{result.logged_in ? "Da" : "Ne"}</dd>
            </div>
            <div className="flex justify-between gap-6 border-b border-border py-3">
              <dt className="text-sm text-muted">Končni naslov</dt>
              <dd className="max-w-xs truncate text-sm">{result.final_url}</dd>
            </div>
          </dl>
        )}
      </div>
    </section>
  );
}
