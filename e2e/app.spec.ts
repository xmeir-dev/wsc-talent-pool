import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const ROOT = join(import.meta.dirname, '..');

/** Fails the test on any console error or uncaught page error (web-font fetches excepted when offline). */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)\.com/.test(m.location().url + m.text())) errors.push(m.text());
  });
  return errors;
}

const bodyRows = (page: Page) => page.locator('table tbody tr');
const title = (page: Page) => page.getByRole('heading', { level: 1 });

async function pick(page: Page, name: string, option: RegExp | string) {
  await page.getByRole('combobox', { name }).click();
  await page.getByRole('option', { name: option, exact: typeof option === 'string' }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

test('the list opens on all attendees; conference and job filters narrow it', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(title(page)).toHaveText('All 75 attendees');
  await expect(bodyRows(page)).toHaveCount(75);
  await expect(page.getByRole('tab')).toHaveCount(0);

  await pick(page, 'Conference', 'Broadcast & Streaming Technology Expo');
  await expect(title(page)).toHaveText('12 of 75 attendees');
  await expect(bodyRows(page)).toHaveCount(12);
  await pick(page, 'Conference', 'All conferences');

  await pick(page, 'Job', /^JOB001 ·/);
  await expect(title(page)).toHaveText('12 of 75 attendees');
  await expect(bodyRows(page)).toHaveCount(12);
  await expect(bodyRows(page).first()).toContainText('Priya Anand');
  await expect(bodyRows(page).nth(7)).toContainText('Needs review');

  await pick(page, 'Job', /^JOB003 ·/);
  await expect(bodyRows(page)).toHaveCount(5);

  await pick(page, 'Conference', 'DevOps World 2025');
  await expect(title(page)).toHaveText('0 of 75 attendees');
  await expect(page.getByText('No one matches these filters.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Export sits on the filter line, right-aligned', async ({ page }) => {
  await page.goto('/');
  const exportBox = (await page.getByRole('button', { name: 'Export' }).boundingBox())!;
  const jobBox = (await page.getByRole('combobox', { name: 'Job' }).boundingBox())!;
  const tableBox = (await page.locator('.ml-dt-root').boundingBox())!;
  expect(Math.abs(exportBox.y + exportBox.height / 2 - (jobBox.y + jobBox.height / 2))).toBeLessThan(2);
  expect(tableBox.x + tableBox.width - (exportBox.x + exportBox.width)).toBeLessThan(40);
});

test('a row opens a profile page; Back, Escape and the browser back button return to the row, filters kept', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await pick(page, 'Job', /^JOB001 ·/);
  const row = page.getByRole('row', { name: /Priya Anand/ });
  await row.focus();
  await page.keyboard.press('Enter');
  const heading = page.getByRole('heading', { level: 1, name: 'Priya Anand' });
  await expect(heading).toBeVisible();
  await expect(page).toHaveURL(/#\/candidate\//);
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Assessed for' })).toContainText('JOB001');
  const main = page.getByRole('main');
  await expect(main).toContainText('Required skills');
  await expect(main).toContainText('Worked with Maya Levi');

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(heading).toHaveCount(0);
  await expect(row).toBeFocused();
  await expect(title(page)).toHaveText('12 of 75 attendees');

  await row.click();
  await expect(heading).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(heading).toHaveCount(0);
  await expect(row).toBeFocused();

  await row.click();
  await expect(heading).toBeVisible();
  await page.goBack();
  await expect(heading).toHaveCount(0);
  await expect(row).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Job' })).toContainText('JOB001');
  expect(errors).toEqual([]);
});

test('with no job chosen, a profile opens on the best job and switches jobs', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.getByRole('row', { name: /Alex Turner/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Alex Turner' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Assessed for' })).toContainText('JOB003');
  await pick(page, 'Assessed for', /^JOB001 ·/);
  await expect(page.getByRole('main')).toContainText('Not recommended for this role');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(title(page)).toHaveText('All 75 attendees');
  expect(errors).toEqual([]);
});

test('export: a job downloads the same bytes the CLI writes; no job downloads the filtered attendees', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  const exportNow = async () => {
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export' }).click()]);
    return download;
  };

  await pick(page, 'Conference', 'Data & AI Summit Europe');
  const attendees = await exportNow();
  expect(attendees.suggestedFilename()).toBe('attendees_data-ai-summit-europe.csv');
  const text = readFileSync(await attendees.path(), 'utf8');
  expect(text.split('\n')[0]).toBe(
    'full_name,firstname,lastname,email,company,title,conference_name,conference_date,linkedin_url,relevant_for',
  );
  expect(text.trim().split('\n')).toHaveLength(13);
  await pick(page, 'Conference', 'All conferences');

  for (const jobId of ['JOB001', 'JOB003']) {
    await pick(page, 'Job', new RegExp(`^${jobId} ·`));
    const download = await exportNow();
    expect(download.suggestedFilename()).toBe(`candidates_${jobId}.csv`);
    const file = await download.path();
    expect(readFileSync(file).equals(readFileSync(join(ROOT, 'output', `candidates_${jobId}.csv`)))).toBe(true);
  }
  expect(errors).toEqual([]);
});

test.describe('narrow screen', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true });

  test('no horizontal overflow on the list, a job list or the profile page', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);

    await pick(page, 'Job', /^JOB001 ·/);
    expect(await overflow()).toBeLessThanOrEqual(0);

    await page.getByRole('row', { name: /Priya Anand/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Priya Anand' })).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('table')).toBeVisible();

    await pick(page, 'Conference', 'DevOps World 2025');
    await expect(page.getByText('No one matches these filters.')).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
});
