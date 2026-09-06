import type { UserMeta } from "./api";

export interface Subscription {
  paidTo: Date | null;
  isActive: boolean;
}

/**
 * The server sends `subscriptionPaidTo` as a date string; accept anything
 * `Date` understands rather than assuming a format.
 */
export function readSubscription(meta: UserMeta | null): Subscription {
  const raw = meta?.subscriptionPaidTo;
  if (raw === null || raw === undefined) return { paidTo: null, isActive: false };

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return { paidTo: null, isActive: false };

  return { paidTo: parsed, isActive: parsed > new Date() };
}

/** Long form, for labelled fields: "4. marec 2027". */
export const formatDate = (date: Date) =>
  date.toLocaleDateString("sl-SI", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/**
 * Numeric form, for running text. Slovene would need the genitive month after
 * "do" ("marca", not "marec"), which `toLocaleDateString` will not produce.
 */
export const formatShortDate = (date: Date) => date.toLocaleDateString("sl-SI");
