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

test('keyboard opens and closes the detail and focus returns to the row', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  const row = page.getByRole('row', { name: /Priya Anand/ });
  await row.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Priya Anand' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Priya Anand' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();
  await expect(dialog).toContainText('Required skills');
  await expect(dialog).toContainText('Worked with Maya Levi');

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(row).toBeFocused();

  // The detail is modal: the page behind is covered, and clicking outside the panel closes it.
  // (Role change closing an open detail is covered in view/App.test.tsx; with the modal drawer the
  // role picker can't be reached while the detail is open.)
  await row.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.mouse.click(40, 400);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(row).toBeFocused();
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

  test('no horizontal overflow; detail is a full-width sheet', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);

    await page.getByRole('tab', { name: /^All/ }).click();
    expect(await overflow()).toBeLessThanOrEqual(0);

    await page.getByRole('row', { name: /Priya Anand/ }).click();
    const box = await page.getByRole('dialog').boundingBox();
    expect(box?.width ?? 0).toBeCloseTo(390, 0);
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
