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

test('role switch updates the list and shows the empty shortlist for JOB003', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(bodyRows(page)).toHaveCount(6);
  await expect(bodyRows(page).first()).toContainText('Priya Anand');

  await page.getByRole('combobox', { name: 'Role' }).selectOption('JOB003');
  await expect(page.locator('table')).toHaveCount(0);
  await expect(page.getByText('No one meets every shortlist condition for this role.')).toBeVisible();
  await page.getByRole('button', { name: 'Open Needs review' }).click();
  await expect(bodyRows(page)).toHaveCount(5);
  expect(errors).toEqual([]);
});

test('keyboard opens and closes the detail and focus returns to the row', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  const row = page.getByRole('button', { name: 'Priya Anand' });
  await row.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Priya Anand' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Priya Anand' })).toBeFocused();
  await expect(dialog).toContainText('Possible references');

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(row).toBeFocused();

  // Changing role closes an open detail.
  await row.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('combobox', { name: 'Role' }).selectOption('JOB002');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('export downloads the same bytes the CLI writes', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  for (const jobId of ['JOB001', 'JOB003']) {
    await page.getByRole('combobox', { name: 'Role' }).selectOption(jobId);
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
  test.use({ viewport: { width: 390, height: 844 } });

  test('no horizontal overflow; detail is a full-width sheet', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);

    await page.getByRole('button', { name: /^All/ }).click();
    expect(await overflow()).toBeLessThanOrEqual(0);

    await page.getByRole('button', { name: 'Priya Anand' }).click();
    const box = await page.getByRole('dialog').boundingBox();
    expect(box?.width ?? 0).toBeCloseTo(390, 0);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
