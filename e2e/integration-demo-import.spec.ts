/**
 * F4 and F11 in the integration demo's HubSpot import (real browser): a broken file changes nothing and says where;
 * a second edition of a conference imports and reads apart from the first; the same file again imports nothing.
 * Synthetic data only.
 */
import { expect, test, type Page } from '@playwright/test';

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Import contacts' });
const HEADER = 'full_name,email,company,title,conference_name,conference_date,notes,linkedin_url';
const SUMMIT = 'SportsTech Innovation Summit';
const csv = (...rows: string[]) => Buffer.from([HEADER, ...rows].join('\n') + '\n');

async function choose(page: Page, name: string, buffer: Buffer) {
  if (!(await dialog(page).isVisible())) await page.getByRole('button', { name: 'Import' }).click();
  else await dialog(page).getByRole('button', { name: 'Back' }).click();
  await dialog(page).locator('input[type=file]').setInputFiles({ name, mimeType: 'text/csv', buffer });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Close notifications' }).click();
  await expect(page.getByText('75 records')).toBeVisible();
});

test('F4: an unclosed quote is reported with its line and column and imports no one; the fixed file imports both', async ({ page }) => {
  const ada = (notes: string) => `Ada Broken,ada@example.test,Synth,Engineer,Parse Summit,2026-05-01,${notes},linkedin.com/in/ada-broken`;
  const bob = 'Bob Valid,bob@example.test,Synth,Engineer,Parse Summit,2026-05-01,,linkedin.com/in/bob-valid';
  await choose(page, 'broken.csv', csv(ada('"Met at the booth'), bob));
  await expect(dialog(page)).toContainText("broken.csv can't be imported. Nothing was changed.");
  await expect(dialog(page)).toContainText('Line 2, column 7: a quoted value starts here and is never closed');
  await expect(dialog(page).getByRole('button', { name: /^Import \d/ })).toHaveCount(0);
  await expect(page.getByText('75 records')).toBeVisible();

  await choose(page, 'fixed.csv', csv(ada('"Met at the booth"'), bob));
  await expect(dialog(page)).toContainText('2 new contacts');
  await dialog(page).getByRole('button', { name: 'Import 2 contacts' }).click();
  await expect(page.getByText('77 records')).toBeVisible();
});

test('F11: the 2026 summit imports beside 2024, reads apart in the contact list, and a retried file imports nothing', async ({ page }) => {
  const cara = `Cara New,cara@example.test,Synth,Engineer,${SUMMIT},2026-11-14,,linkedin.com/in/cara-new`;
  const priya = `Priya Anand,priya.anand@vidstream.com,VidStream,Senior Computer Vision Engineer,${SUMMIT},2026-11-14,,linkedin.com/in/priya-anand-cv`;
  const file = csv(cara, priya);
  await choose(page, 'summit-2026.csv', file);
  await expect(dialog(page)).toContainText(`2 rows from ${SUMMIT} (2026).`);
  await expect(dialog(page)).toContainText('1 new contacts · 1 added as an event to an existing contact');
  await dialog(page).getByRole('button', { name: 'Import 2 contacts' }).click();
  await expect(page.getByText('76 records')).toBeVisible();

  const contacts = page.getByRole('table', { name: 'All contacts' });
  await expect(contacts.getByRole('row', { name: /Cara New/ })).toContainText(`${SUMMIT} (2026)`);
  // Priya is one contact with two editions, the latest shown (newest contacts first, so she is on page 3).
  await page.getByRole('button', { name: 'Next ›' }).click();
  await page.getByRole('button', { name: 'Next ›' }).click();
  await expect(contacts.getByRole('row', { name: /Priya Anand/ })).toHaveCount(1);
  await expect(contacts.getByRole('row', { name: /Priya Anand/ })).toContainText(`${SUMMIT} (2026) +1`);

  // The same file again: nothing to import, nothing changes.
  await choose(page, 'summit-2026.csv', file);
  await expect(dialog(page).getByTestId('import-nothing-new')).toHaveText('Everyone in this file is already recorded for this event. Nothing to import.');
  await expect(dialog(page).getByRole('button', { name: /^Import \d/ })).toHaveCount(0);
  await dialog(page).getByRole('button', { name: 'Back' }).click();
  await dialog(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('76 records')).toBeVisible();
});
