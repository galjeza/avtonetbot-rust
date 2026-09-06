import type { Page } from 'puppeteer-core';

import { field, fieldValue, type CarField } from '../utils/car-fields';
import { wait } from '../utils/wait';

declare global {
  interface Window {
    CKEDITOR?: { instances?: Record<string, { setData: (html: string) => void }> };
  }
}

/**
 * The description is a CKEditor field. Setting the underlying textarea alone
 * is not enough — the editor holds its own copy and overwrites it on submit —
 * so both are updated.
 */
export const fillWysiwygOpis = async (page: Page, carData: CarField[]): Promise<void> => {
  const htmlOpis = fieldValue(carData, 'htmlOpis') ?? fieldValue(carData, 'opombe');
  if (!htmlOpis) {
    console.log('[fillWysiwygOpis] No htmlOpis/opombe value found in carData');
    return;
  }

  await page.evaluate((html: string) => {
    const textarea = (document.querySelector('#editor1') ??
      document.querySelector('textarea[name="opombe"]')) as HTMLTextAreaElement | null;

    if (textarea) textarea.value = html;

    const editor = window.CKEDITOR?.instances?.editor1;
    if (editor) editor.setData(html);
  }, htmlOpis);

  await wait(2);
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
    // distinguishable by value, so they are stored as "opombeznamka|BMW".
    const dataEntry =
      field(carData, meta.name) ??
      (meta.name === 'opombeznamka' ? field(carData, `opombeznamka|${meta.value}`) : undefined);

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
