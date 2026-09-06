import { useState } from "react";
import { Button, Input, Label, TextField, toast } from "@heroui/react";

import type { Config } from "../lib/api";

interface Props {
  config: Config;
  onSave: (config: Config) => Promise<void>;
}

export default function Konfiguracija({ config, onSave }: Props) {
  const [email, setEmail] = useState(config.email);
  const [password, setPassword] = useState(config.password);
  const [isSaving, setIsSaving] = useState(false);

  const save = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      toast.danger("Vnesite e-pošto.");
      return;
    }

    setIsSaving(true);
    try {
      await onSave({ email: trimmed, password });
      toast.success("Nastavitve shranjene.");
    } catch (e) {
      toast.danger("Nastavitev ni bilo mogoče shraniti.", {
        description: String(e),
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section>
      <h1 className="text-xl font-semibold tracking-tight">Konfiguracija</h1>

      <div className="mt-6 flex max-w-md flex-col gap-5">
        <TextField value={email} onChange={setEmail} type="email">
          <Label>E-pošta</Label>
          <Input placeholder="ime@primer.si" />
          <p className="mt-1.5 text-xs text-muted">
            Uporabimo jo za preverjanje naročnine.
          </p>
        </TextField>

        <TextField value={password} onChange={setPassword}>
          <Label>Geslo za avto.net</Label>
          <Input type="password" />
          <p className="mt-1.5 text-xs text-muted">
            Shranjeno lokalno na tem računalniku.
          </p>
        </TextField>

        <div>
          <Button onPress={save} isDisabled={isSaving}>
            {isSaving ? "Shranjujem…" : "Shrani"}
          </Button>
        </div>
      </div>
    </section>
  );
}
