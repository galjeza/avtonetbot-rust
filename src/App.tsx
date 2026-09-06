import { useCallback, useEffect, useState } from "react";
import { Spinner, Toast } from "@heroui/react";

import {
  fetchUserMeta,
  getConfig,
  saveConfig,
  type Config,
  type UserMeta,
} from "./lib/api";
import { formatShortDate, readSubscription } from "./lib/subscription";
import Konfiguracija from "./views/Konfiguracija";
import ObnoviAvtomobile from "./views/ObnoviAvtomobile";
import Pregled from "./views/Pregled";

const TABS = [
  { id: "pregled", label: "Pregled" },
  { id: "konfiguracija", label: "Konfiguracija" },
  { id: "obnovi", label: "Obnovi avtomobile" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const EMPTY_CONFIG: Config = { email: "", password: "" };

export default function App() {
  const [tab, setTab] = useState<TabId>("pregled");
  const [config, setConfig] = useState<Config>(EMPTY_CONFIG);
  const [meta, setMeta] = useState<UserMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Refreshes the subscription record; a missing email is not an error. */
  const refreshMeta = useCallback(async (email: string) => {
    if (!email) {
      setMeta(null);
      setError(null);
      return;
    }
    try {
      setMeta(await fetchUserMeta(email));
      setError(null);
    } catch (e) {
      setMeta(null);
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const stored = await getConfig();
        setConfig(stored);
        await refreshMeta(stored.email);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshMeta]);

  const handleSave = async (next: Config) => {
    await saveConfig(next);
    setConfig(next);
    await refreshMeta(next.email);
  };

  const subscription = readSubscription(meta);

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Toast.Provider />

      <aside className="flex w-60 shrink-0 flex-col justify-between border-r border-border bg-background-secondary">
        <div>
          <div className="px-5 py-5 text-[0.9375rem] font-semibold tracking-tight">
            AvtonetBot
          </div>

          <nav className="flex flex-col">
            {TABS.map(({ id, label }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  aria-current={active ? "page" : undefined}
                  className={`border-l-2 px-5 py-2 text-left text-sm transition-colors ${
                    active
                      ? "border-accent bg-surface font-medium text-foreground"
                      : "border-transparent text-muted hover:bg-surface-hover hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Subscription gates every renewal, so it reads as a state, not a note. */}
        <div className="p-3">
          {loading ? (
            <div className="flex justify-center py-4">
              <Spinner size="sm" />
            </div>
          ) : (
            <div
              className={`rounded-md px-4 py-3 ${
                subscription.isActive
                  ? "bg-success text-success-foreground"
                  : "bg-danger text-danger-foreground"
              }`}
            >
              <div className="text-sm font-semibold">
                {subscription.isActive ? "Naročnina aktivna" : "Naročnina ni aktivna"}
              </div>
              <div className="mt-0.5 text-sm opacity-85">
                {subscription.paidTo
                  ? `Velja do ${formatShortDate(subscription.paidTo)}`
                  : config.email
                    ? "Ni podatka o naročnini"
                    : "Vnesite e-pošto"}
              </div>
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl px-10 py-9">
          {loading ? (
            <Spinner />
          ) : (
            <>
              {tab === "pregled" && (
                <Pregled
                  config={config}
                  meta={meta}
                  subscription={subscription}
                  error={error}
                  onConfigure={() => setTab("konfiguracija")}
                />
              )}
              {tab === "konfiguracija" && (
                <Konfiguracija config={config} onSave={handleSave} />
              )}
              {tab === "obnovi" && (
                <ObnoviAvtomobile subscription={subscription} />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
