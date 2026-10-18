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

async function pickRole(page: Page, jobId: string) {
  await page.getByRole('combobox', { name: 'Role' }).click();
  await page.getByRole('option', { name: new RegExp(`^${jobId} ·`) }).click();
  await expect(page.getByRole('combobox', { name: 'Role' })).toContainText(jobId);
}

test('role switch updates the list and shows the empty shortlist for JOB003', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(bodyRows(page)).toHaveCount(7);
  await expect(bodyRows(page).first()).toContainText('Priya Anand');

  await pickRole(page, 'JOB003');
  await expect(page.locator('table')).toHaveCount(0);
  await expect(page.getByText('No product management candidate lists Sports Analytics.')).toBeVisible();
  await page.getByRole('button', { name: 'Open Needs review' }).click();
  await expect(bodyRows(page)).toHaveCount(5);
  expect(errors).toEqual([]);
});

test('a row opens a profile page; Back, Escape and the browser back button return to the row', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  const row = page.getByRole('row', { name: /Priya Anand/ });
  await row.focus();
  await page.keyboard.press('Enter');
  const heading = page.getByRole('heading', { level: 1, name: 'Priya Anand' });
  await expect(heading).toBeVisible();
  await expect(page).toHaveURL(/#\/candidate\//);
  await expect(page.getByRole('table')).toHaveCount(0);
  const main = page.getByRole('main');
  await expect(main).toContainText('Required skills');
  await expect(main).toContainText('Worked with Maya Levi');

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(heading).toHaveCount(0);
  await expect(row).toBeFocused();

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
  expect(errors).toEqual([]);
});

test('export downloads the same bytes the CLI writes', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  for (const jobId of ['JOB001', 'JOB003']) {
    await pickRole(page, jobId);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export all for role' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(`candidates_${jobId}.csv`);
    const file = await download.path();
    expect(readFileSync(file).equals(readFileSync(join(ROOT, 'output', `candidates_${jobId}.csv`)))).toBe(true);
  }
  expect(errors).toEqual([]);
});

test.describe('narrow screen', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true });

  test('no horizontal overflow on the list or the profile page', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);

    await page.getByRole('tab', { name: /^All/ }).click();
    expect(await overflow()).toBeLessThanOrEqual(0);

    await page.getByRole('row', { name: /Priya Anand/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Priya Anand' })).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('table')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
