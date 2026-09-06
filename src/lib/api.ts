import { invoke } from "@tauri-apps/api/core";

export interface Config {
  email: string;
  password: string;
}

/** User record as returned by the licence server. */
export interface UserMeta {
  subscriptionPaidTo?: string | number | null;
  brokerId?: string | number | null;
  hdImages?: boolean | null;
}

export const getConfig = () => invoke<Config>("get_config");

export const saveConfig = (config: Config) =>
  invoke<void>("save_config", { config });

/** Resolves to null when the server does not know the address. */
export const fetchUserMeta = (email: string) =>
  invoke<UserMeta | null>("fetch_user_meta", { email });

export interface SessionCheck {
  logged_in: boolean;
  final_url: string;
  profile_seeded: boolean;
}

/** Launches Chrome on our profile copy and reports the avto.net session state. */
export const checkBrowserSession = () =>
  invoke<SessionCheck>("check_browser_session");
