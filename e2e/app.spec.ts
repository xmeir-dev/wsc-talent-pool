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
const title = (page: Page) => page.locator('.list-count');

const trigger = (page: Page, name: 'Conference' | 'Job' | 'Status') =>
  page.locator('.filters').getByRole('button', { name: new RegExp(`^${name}`) });
const menu = (page: Page, name: string) => page.getByRole('dialog', { name });

/** Opens a filter menu, toggles chips, and closes it with Escape. */
async function pick(page: Page, name: 'Conference' | 'Job' | 'Status', ...chips: RegExp[]) {
  await trigger(page, name).click();
  for (const chip of chips) await menu(page, name).getByRole('button', { name: chip }).click();
  await page.keyboard.press('Escape');
  await expect(menu(page, name)).toHaveCount(0);
}

test('the list opens on all attendees; conference and job filters narrow it', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(title(page)).toHaveText('All 75 attendees');
  await expect(bodyRows(page)).toHaveCount(12);
  await expect(page.getByText('Page 1 of 7')).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(0);

  await pick(page, 'Conference', /^Broadcast Expo/);
  await expect(title(page)).toHaveText('12 of 75 attendees');
  await expect(bodyRows(page)).toHaveCount(12);
  await pick(page, 'Conference', /^Broadcast Expo/);
  await expect(title(page)).toHaveText('All 75 attendees');

  await pick(page, 'Job', /^Senior ML Engineer/);
  await expect(title(page)).toHaveText('12 of 75 attendees');
  await expect(bodyRows(page)).toHaveCount(12);
  await expect(bodyRows(page).first()).toContainText('Priya Anand');
  await expect(bodyRows(page).nth(7)).toContainText('Needs review');

  await pick(page, 'Job', /^Senior ML Engineer/, /^Senior Product Manager/);
  await expect(bodyRows(page)).toHaveCount(5);

  await pick(page, 'Conference', /^DevOps World/);
  await expect(title(page)).toHaveText('0 of 75 attendees');
  await expect(page.getByText('No one matches these filters.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a filter menu: chips toggle with mouse and keyboard, the menu stays open, Escape and outside clicks close it', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  const conf = trigger(page, 'Conference');
  await conf.click();
  const panel = menu(page, 'Conference');
  await expect(panel).toBeVisible();
  // Focus moves to the first chip; Space and Enter toggle it.
  const first = panel.getByRole('button', { name: /^SportsTech/ });
  await expect(first).toBeFocused();
  await page.keyboard.press('Space');
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(title(page)).toHaveText('40 of 75 attendees');
  await panel.getByRole('button', { name: /^Data & AI Summit/ }).click();
  await expect(panel).toBeVisible();
  await expect(conf).toContainText('SportsTech +1');
  await expect(panel.locator('[aria-pressed="true"]')).toHaveCount(2);

  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(conf).toBeFocused();

  await conf.click();
  await panel.getByRole('button', { name: 'Clear' }).click();
  await expect(title(page)).toHaveText('All 75 attendees');
  await expect(conf).toContainText('All');
  await page.mouse.click(5, 600);
  await expect(panel).toHaveCount(0);

  // Two jobs: the attendee list, anyone relevant for either.
  await pick(page, 'Job', /^Senior ML Engineer/, /^Data Engineer/);
  await expect(trigger(page, 'Job')).toContainText('Senior ML Engineer +1');
  await expect(page.locator('.attendees table')).toBeVisible();
  const count = Number((await title(page).textContent())!.split(' ')[0]);
  expect(count).toBeGreaterThan(12);
  await expect(bodyRows(page)).toHaveCount(12);
  await expect(page.getByText(`Page 1 of ${Math.ceil(count / 12)}`)).toBeVisible();
  expect(errors).toEqual([]);
});

test('clicking a column header sorts the attendee list', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  const firstName = () => bodyRows(page).first().locator('.name').textContent();
  // Default: by relevant job, shortlisted first.
  await expect(bodyRows(page).first().locator('.jobs .fit').first()).toContainText('Senior ML Engineer: Shortlist');
  await page.getByRole('columnheader', { name: /Candidate/ }).getByRole('button').click();
  expect(await firstName()).toContain('Adaora Okafor');
  await page.getByRole('columnheader', { name: /Candidate/ }).getByRole('button').click();
  expect(await firstName()).not.toContain('Adaora Okafor');
  await page.getByRole('columnheader', { name: /Relevant job/ }).getByRole('button').click();
  await expect(bodyRows(page).first().locator('.jobs .fit').first()).toContainText('Senior ML Engineer: Shortlist');
  expect(errors).toEqual([]);
});

test('Download sits on the filter line, right-aligned', async ({ page }) => {
  await page.goto('/');
  const exportBox = (await page.getByRole('button', { name: 'Download CSV' }).boundingBox())!;
  const jobBox = (await trigger(page, 'Job').boundingBox())!;
  const tableBox = (await page.locator('.ml-dt-root').boundingBox())!;
  expect(Math.abs(exportBox.y + exportBox.height / 2 - (jobBox.y + jobBox.height / 2))).toBeLessThan(2);
  expect(tableBox.x + tableBox.width - (exportBox.x + exportBox.width)).toBeLessThan(40);
});

test('a row opens a profile page; Back, Escape and the browser back button return to the row, filters kept', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await pick(page, 'Job', /^Senior ML Engineer/);
  const row = page.getByRole('row', { name: /Priya Anand/ });
  await row.focus();
  await page.keyboard.press('Enter');
  const heading = page.getByRole('heading', { level: 1, name: 'Priya Anand' });
  await expect(heading).toBeVisible();
  await expect(page).toHaveURL(/#\/candidate\//);
  await expect(page.getByRole('table')).toHaveCount(0);
  const main = page.getByRole('main');
  await expect(main.locator('.d-job')).toContainText(['Senior ML Engineer']);
  await expect(main).toContainText('Worked with Maya Levi');

  await page.getByRole('button', { name: 'Back', exact: true }).click();
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
  await expect(trigger(page, 'Job')).toContainText('Senior ML Engineer');
  expect(errors).toEqual([]);
});

test('a profile shows every job they may fit, whatever the list filter', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await pick(page, 'Job', /^Backend Engineer/);
  await page.getByRole('row', { name: /Ingrid Svensson/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ingrid Svensson' })).toBeVisible();
  await expect(page.locator('.d-job')).toHaveText(['Data Engineer', 'Backend Engineer']);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(title(page)).toHaveText(/of 75 attendees/);
  expect(errors).toEqual([]);
});

test('export: a job offers the same bytes the CLI writes; no job downloads the filtered attendees', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  const exportNow = async (choice?: RegExp) => {
    const button = page.getByRole('button', { name: 'Download CSV' });
    if (choice) await button.click();
    const target = choice ? page.getByRole('menuitem', { name: choice }) : button;
    const [download] = await Promise.all([page.waitForEvent('download'), target.click()]);
    return download;
  };

  await pick(page, 'Conference', /^Data & AI Summit/);
  const attendees = await exportNow();
  expect(attendees.suggestedFilename()).toBe('attendees_data-ai-summit-europe.csv');
  const text = readFileSync(await attendees.path(), 'utf8');
  expect(text.split('\n')[0]).toBe(
    'full_name,firstname,lastname,email,company,title,conference_name,conference_date,linkedin_url,relevant_for',
  );
  expect(text.trim().split('\n')).toHaveLength(13);
  await pick(page, 'Conference', /^Data & AI Summit/);

  for (const [jobId, chips] of [
    ['JOB001', [/^Senior ML Engineer/]],
    ['JOB003', [/^Senior ML Engineer/, /^Senior Product Manager/]],
  ] as const) {
    await pick(page, 'Job', ...chips);
    const download = await exportNow(new RegExp(`^Full ${jobId} assessment`));
    expect(download.suggestedFilename()).toBe(`candidates_${jobId}.csv`);
    const file = await download.path();
    expect(readFileSync(file).equals(readFileSync(join(ROOT, 'output', `candidates_${jobId}.csv`)))).toBe(true);
  }

  // Several jobs: the attendees shown, named after the filter.
  await pick(page, 'Job', /^Data Engineer/);
  const several = await exportNow();
  expect(several.suggestedFilename()).toBe('attendees_job003_job004.csv');
  expect(errors).toEqual([]);
});

test.describe('narrow screen', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true });

  test('no horizontal overflow on the list, a job list or the profile page', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);

    await pick(page, 'Job', /^Senior ML Engineer/);
    expect(await overflow()).toBeLessThanOrEqual(0);

    await page.getByRole('row', { name: /Priya Anand/ }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Priya Anand' })).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByRole('table')).toBeVisible();

    // The filter menu fits the phone, 16px from each edge.
    await trigger(page, 'Conference').click();
    const panel = menu(page, 'Conference');
    await expect(panel).toBeVisible();
    const box = (await panel.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(15);
    expect(box.x + box.width).toBeLessThanOrEqual(390 - 15);
    await panel.getByRole('button', { name: /^DevOps World/ }).click();
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.keyboard.press('Escape');
    await expect(page.getByText('No one matches these filters.')).toBeVisible();
    expect(await overflow()).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
});

test('QA #003/#009: a chosen status stays visible, and one job offers shown people or the full CLI file', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await pick(page, 'Status', /^Declined/);
  await pick(page, 'Job', /^Senior ML Engineer/);
  await expect(title(page)).toHaveText('0 of 75 attendees');
  await expect(trigger(page, 'Status').locator('.filter-value')).toHaveText('Declined');

  await page.getByRole('button', { name: 'Download CSV' }).click();
  await expect(page.getByRole('menuitem')).toHaveText(['Attendees shown (0)', 'Full JOB001 assessment (75)']);
  const [shown] = await Promise.all([page.waitForEvent('download'), page.getByRole('menuitem', { name: /^Attendees shown/ }).click()]);
  expect(readFileSync(await shown.path(), 'utf8').trim().split('\n')).toHaveLength(1);

  await trigger(page, 'Status').click();
  await menu(page, 'Status').getByRole('button', { name: 'Clear' }).click();
  await expect(trigger(page, 'Status').locator('.filter-value')).toHaveText('All');
  await expect(title(page)).toHaveText('12 of 75 attendees');
  expect(errors).toEqual([]);
});
