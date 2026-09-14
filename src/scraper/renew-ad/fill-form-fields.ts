import type { Page } from 'puppeteer-core';

import { field, fieldValue, type CarField } from '../utils/car-fields';
import { wait } from '../utils/wait';

declare global {
  interface Window {
    CKEDITOR?: {
      instances?: Record<string, { setData: (html: string) => void; getData: () => string }>;
    };
  }
}

/** The description textarea, and the CKEditor instance bound to it, if any. */
const OPIS_TEXTAREA_SELECTOR = '#editor1, textarea[name="opombe"]';

/**
 * CKEditor registers its instance under the textarea's id (or name) some time
 * after the page's load event. Until it does, `setData` cannot be called and
 * writing the textarea alone is pointless: the editor snapshots the textarea
 * when it boots and writes its own copy back over it on submit.
 *
 * Waiting for the instance is what stops a description from being silently
 * left at whatever avto.net pre-filled the form with — on a recreated ad that
 * is the archived copy's text, which is exactly what must not be published.
 */
const waitForCkeditor = async (page: Page): Promise<void> => {
  await page
    .waitForFunction(
      (selector: string) => {
        const textarea = document.querySelector(selector) as HTMLTextAreaElement | null;
        // No CKEditor on this form at all: a plain textarea is ready at once.
        if (!textarea || !window.CKEDITOR) return true;
        const key = textarea.id || textarea.name;
        return Boolean(window.CKEDITOR.instances?.[key] ?? window.CKEDITOR.instances?.editor1);
      },
      { timeout: 30 * 1000 },
      OPIS_TEXTAREA_SELECTOR,
    )
    .catch(() => {
      console.warn('[setWysiwygOpis] CKEditor did not register in time, writing anyway');
    });
};

/** Whatever the form would submit as the description right now. */
export const readWysiwygOpis = async (page: Page): Promise<string | null> =>
  page.evaluate((selector: string) => {
    const textarea = document.querySelector(selector) as HTMLTextAreaElement | null;
    if (!textarea) return null;

    const key = textarea.id || textarea.name;
    const editor = window.CKEDITOR?.instances?.[key] ?? window.CKEDITOR?.instances?.editor1;
    // The editor's copy wins: it is what overwrites the textarea on submit.
    return editor ? editor.getData() : textarea.value;
  }, OPIS_TEXTAREA_SELECTOR);

/**
 * Writes the description on whichever page is open.
 *
 * Setting the underlying textarea alone is not enough — CKEditor holds its own
 * copy and overwrites it on submit — so both are updated.
 */
export const setWysiwygOpis = async (page: Page, html: string): Promise<void> => {
  await waitForCkeditor(page);

  await page.evaluate(
    (value: string, selector: string) => {
      const textarea = document.querySelector(selector) as HTMLTextAreaElement | null;
      if (textarea) textarea.value = value;

      const key = textarea ? textarea.id || textarea.name : '';
      const editor = window.CKEDITOR?.instances?.[key] ?? window.CKEDITOR?.instances?.editor1;
      if (editor) editor.setData(value);
    },
    html,
    OPIS_TEXTAREA_SELECTOR,
  );

  await wait(2);
};

/**
 * Reads the description out of scraped data and writes it to the open form.
 *
 * The write is read back, because a no-op `setData` looks identical to a
 * successful one from here: the ad still publishes, just with whatever text
 * the form already held.
 */
export const fillWysiwygOpis = async (page: Page, carData: CarField[]): Promise<void> => {
  const htmlOpis = fieldValue(carData, 'htmlOpis') ?? fieldValue(carData, 'opombe');
  if (!htmlOpis) {
    console.log('[fillWysiwygOpis] No htmlOpis/opombe value found in carData');
    return;
  }

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await setWysiwygOpis(page, htmlOpis);

    const actual = await readWysiwygOpis(page).catch(() => null);
    // CKEditor reformats the HTML it is given (attribute order, entities,
    // whitespace), so the text content is the only thing worth comparing.
    const strip = (value: string): string =>
      value
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (actual !== null && strip(actual) === strip(htmlOpis)) {
      console.log('[fillWysiwygOpis] Description written and verified', { attempt });
      return;
    }

    console.warn('[fillWysiwygOpis] Description did not take, retrying', {
      attempt,
      actualPreview: actual === null ? null : strip(actual).slice(0, 120),
      expectedPreview: strip(htmlOpis).slice(0, 120),
    });
    await wait(3);
  }

  // Not thrown: the old ad is already deleted by this point, so publishing the
  // replacement with a stale description still beats abandoning it.
  console.error('[fillWysiwygOpis] Giving up on verifying the description');
};

export const fillCheckboxesFromData = async (page: Page, carData: CarField[]): Promise<void> => {
  const checkboxes = await page.$$('input[type=checkbox]');

  for (const checkbox of checkboxes) {
    const meta = await checkbox.evaluate((node) => ({
      name: (node as HTMLInputElement).name,
      value: (node as HTMLInputElement).value,
      checked: (node as HTMLInputElement).checked,
    }));

    // Brand-compatibility boxes all share the name "opombeznamka" and are only
    // distinguishable by value, so they are stored as "opombeznamka|BMW". That
    // key is tried first: a bare "opombeznamka" entry can only be a leftover
    // from a scrape that read the attribute value rather than the tick.
    const dataEntry =
      (meta.name === 'opombeznamka' ? field(carData, `opombeznamka|${meta.value}`) : undefined) ??
      field(carData, meta.name);

    if (!dataEntry) continue;

    const shouldBeChecked = dataEntry.value === '1';
    // Clicking unconditionally would toggle correct boxes off.
    if (shouldBeChecked !== meta.checked) {
      await checkbox.click();
    }
  }
};

export const fillInputsFromData = async (page: Page, carData: CarField[]): Promise<void> => {
  const inputs = await page.$$('input[type=text]');

  for (const input of inputs) {
    try {
      const name = await input.evaluate((node) => (node as HTMLInputElement).name);
      const value = fieldValue(carData, name);
      if (value) {
        await input.click({ clickCount: 3 });
        await input.type(value);
      }
    } catch {
      // Fields appear and disappear as the form reacts to earlier choices.
      continue;
    }
  }
};

export const fillSelectsFromData = async (page: Page, carData: CarField[]): Promise<void> => {
  const selects = await page.$$('select');

  for (const select of selects) {
    try {
      const name = await select.evaluate((node) => (node as HTMLSelectElement).name);
      const value = fieldValue(carData, name);
      if (value) {
        await select.select(value);
      }
    } catch {
      continue;
    }
  }
};

export const fillTextareasFromData = async (page: Page, carData: CarField[]): Promise<void> => {
  const textareas = await page.$$('textarea');

  for (const textarea of textareas) {
    try {
      const name = await textarea.evaluate((node) => (node as HTMLTextAreaElement).name);
      // The description is handled by fillWysiwygOpis; typing into it here
      // would duplicate or corrupt the HTML.
      if (name === 'opombe') continue;

      const value = fieldValue(carData, name);
      if (value) {
        await textarea.click({ clickCount: 3 });
        await textarea.evaluate((node) => {
          (node as HTMLTextAreaElement).value = '';
        });
        await textarea.type(value);
      }
    } catch {
      continue;
    }
  }
};
