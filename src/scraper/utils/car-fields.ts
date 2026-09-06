/**
 * An ad's edit form is scraped into a flat list of name/value pairs rather
 * than an object, because avto.net reuses field names (several checkboxes are
 * all called "opombeznamka") and the set of fields differs per ad type.
 *
 * These helpers keep the lookup — and the value-shape handling — in one place.
 */
export interface CarField {
  name: string;
  value: string | string[] | null;
}

export const field = (fields: CarField[], name: string): CarField | undefined =>
  fields.find((f) => f.name === name);

/**
 * The value of a field, but only when it is a usable non-empty string.
 * Image lists are arrays and unset fields are null, so callers that want to
 * type or select a value need that narrowing anyway.
 */
export function fieldValue(fields: CarField[], name: string): string | undefined {
  const value = field(fields, name)?.value;
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** Same, but throws with a readable message when the field is missing. */
export function requireFieldValue(fields: CarField[], name: string, context: string): string {
  const value = fieldValue(fields, name);
  if (value === undefined) {
    throw new Error(`Polja "${name}" ni bilo mogoče najti (${context}).`);
  }
  return value;
}
