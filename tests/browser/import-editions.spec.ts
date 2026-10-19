/**
 * Importing and exporting in the recruiter view (real browser): a broken list changes nothing and says where; another edition
 * of a conference imports and is its own filter choice; retrying a list is harmless; the Excel download keeps
 * formula-like names as text. Synthetic data only.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { readXlsx, records } from '../tests/xlsx-read';

const title = (page: Page) => page.locator('.list-count');
const popover = (page: Page) => page.getByRole('dialog', { name: 'Add a conference' });
const conferenceMenu = (page: Page) => page.getByRole('dialog', { name: 'Conference' });

const HEADER = 'full_name,email,company,title,conference_name,conference_domain,conference_date,notes,linkedin_url';
const SUMMIT = 'SportsTech Innovation Summit';
const csv = (...rows: string[]) => Buffer.from([HEADER, ...rows].join('\n') + '\n');

async function addList(page: Page, name: string, buffer: Buffer) {
  // After a successful import the popover fades out while still visible; wait for it to go before reopening.
  if (!(await popover(page).and(page.locator('[data-open="true"]')).isVisible())) {
    await expect(popover(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Add conference' }).click();
  }
  await popover(page).locator('input[type=file]').setInputFiles({ name, mimeType: 'text/csv', buffer });
}

test('a list with an unclosed quote adds no one and says where; the corrected list adds both', async ({ page }) => {
  await page.goto('/');
  await expect(title(page)).toHaveText('All 75 attendees');
  const ada = (notes: string) => `Ada Broken,ada@example.test,Synth,Engineer,Parse Summit,Sports Technology,2026-05-01,${notes},linkedin.com/in/ada-broken`;
  const bob = 'Bob Valid,bob@example.test,Synth,Engineer,Parse Summit,Sports Technology,2026-05-01,,linkedin.com/in/bob-valid';

  await addList(page, 'broken.csv', csv(ada('"Met at the booth'), bob));
  await expect(popover(page).getByRole('status')).toContainText('Nothing was added. This list: line 2, column 8: a quoted value starts here and is never closed');
  await expect(title(page)).toHaveText('All 75 attendees');

  await addList(page, 'fixed.csv', csv(ada('"Met at the booth"'), bob));
  await expect(popover(page)).toHaveCount(0);
  await expect(title(page)).toHaveText('2 of 77 attendees');
  await expect(page.getByRole('row', { name: /Ada Broken/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /Bob Valid/ })).toBeVisible();
});

test('SportsTech 2026 imports next to 2024, both editions filter apart, a later batch adds only new attendance, a retry is harmless', async ({ page }) => {
  await page.goto('/');
  const cara = `Cara New,cara@example.test,Synth,Engineer,${SUMMIT},Sports Technology & Analytics,2026-11-14,,linkedin.com/in/cara-new`;
  // Priya (a 2024 attendee, same LinkedIn URL) at the 2026 run: one person, a second attendance.
  const priya = `Priya Anand,priya.anand@vidstream.com,VidStream,Senior Computer Vision Engineer,${SUMMIT},Sports Technology & Analytics,2026-11-14,,linkedin.com/in/priya-anand-cv`;
  await addList(page, 'summit-2026.csv', csv(cara, priya));
  await expect(title(page)).toHaveText('2 of 76 attendees');

  await page.locator('.filters').getByRole('button', { name: /^Conference/ }).click();
  const chips = conferenceMenu(page).getByRole('button', { name: /^SportsTech/ });
  await expect(chips).toHaveText(['SportsTech (2024) 40', 'SportsTech (2026) 2']);
  // The import filtered the table to the 2026 edition only.
  await expect(chips.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(chips.nth(0)).toHaveAttribute('aria-pressed', 'false');
  await chips.nth(1).click();
  await chips.nth(0).click();
  await expect(title(page)).toHaveText('40 of 76 attendees');
  await page.keyboard.press('Escape');

  // A later batch for 2026: Cara again (day two) and one new person.
  const dev = `Dev Later,dev@example.test,Synth,Engineer,${SUMMIT},Sports Technology & Analytics,2026-11-15,,linkedin.com/in/dev-later`;
  await addList(page, 'summit-2026-late.csv', csv(cara.replace('2026-11-14', '2026-11-15'), dev));
  await expect(title(page)).toHaveText('3 of 77 attendees');

  // The exact same file again: nothing changes, and it says so.
  await addList(page, 'summit-2026-late.csv', csv(cara.replace('2026-11-14', '2026-11-15'), dev));
  await expect(popover(page).getByRole('status')).toHaveText('Everyone on this list is already recorded for this event. Nothing changed.');
  await page.keyboard.press('Escape');
  await expect(title(page)).toHaveText('3 of 77 attendees');
  await expect(page.getByRole('row', { name: /Cara New/ })).toHaveCount(1);
});

test('a formula-like name downloads as text in the Excel file', async ({ page }) => {
  await page.goto('/');
  await addList(page, 'formula.csv', csv('=1+2,formula@example.test,"@SUM(1,2)",Engineer,Formula Meetup,Sports Technology,2026-10-19,,'));
  await expect(title(page)).toHaveText('1 of 76 attendees');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download' }).click()]);
  expect(download.suggestedFilename()).toBe('attendees_formula-meetup.xlsx');
  const sheet = readXlsx(readFileSync(await download.path()));
  expect(records(sheet)[0]).toMatchObject({ full_name: '=1+2', firstname: '=1+2', company: '@SUM(1,2)' });
  expect(sheet.cells.every((c) => c.type === 'inlineStr' && !c.formula)).toBe(true);
});

test('one file with Cara on the 14th and 17th and Dev on the 20th is one edition, and both stay in view', async ({ page }) => {
  await page.goto('/');
  const at = (name: string, date: string) =>
    `${name},${name.toLowerCase().replace(' ', '.')}@example.test,Synth,Engineer,${SUMMIT},Sports Technology & Analytics,${date},,linkedin.com/in/${name.toLowerCase().replace(' ', '-')}`;
  await addList(page, 'summit-2026.csv', csv(at('Cara New', '2026-11-14'), at('Cara New', '2026-11-17'), at('Dev Later', '2026-11-20')));
  await expect(title(page)).toHaveText('2 of 77 attendees');
  await expect(page.getByRole('row', { name: /Dev Later/ })).toBeVisible();
  await page.locator('.filters').getByRole('button', { name: /^Conference/ }).click();
  await expect(conferenceMenu(page).getByRole('button', { name: /^SportsTech/ })).toHaveText(['SportsTech (2024) 40', 'SportsTech (2026) 2']);
});

test('retrying a list whose row has no email, LinkedIn URL or ID changes nothing', async ({ page }) => {
  await page.goto('/');
  const file = Buffer.from(`${HEADER}\nNo Ids,,Synth,Eng,NoId Meetup,Sports,2026-05-01,,\n`);
  await addList(page, 'noid.csv', file);
  await expect(title(page)).toHaveText('1 of 76 attendees');
  for (let i = 0; i < 2; i++) {
    await addList(page, 'noid.csv', file);
    await expect(popover(page).getByRole('status')).toHaveText('Everyone on this list is already recorded for this event. Nothing changed.');
  }
  await page.keyboard.press('Escape');
  await expect(title(page)).toHaveText('1 of 76 attendees');
});
