import { expect, test, type Page } from '@playwright/test';

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)\.com/.test(m.location().url + m.text())) errors.push(m.text());
  });
  return errors;
}

async function seniorMl(page: Page, job: string | null = 'Senior ML Engineer') {
  await page.goto('/');
  await page.evaluate(() => localStorage.removeItem('wsc-activity-v1'));
  await page.goto('/');
  if (!job) return;
  await page.locator('.filters').getByRole('button', { name: /^Job/ }).click();
  await page.getByRole('dialog', { name: 'Job' }).getByRole('button', { name: new RegExp(`^${job}`) }).click();
  await page.keyboard.press('Escape');
}

const priya = (page: Page) => page.getByRole('row', { name: /Priya Anand/ });
const profile = (page: Page) => page.getByRole('heading', { level: 1, name: 'Priya Anand' });
const selection = (page: Page) => page.getByRole('region', { name: 'Selected attendees', exact: true });

test('F12: Space on a row checkbox selects without opening the profile; Space again deselects', async ({ page }) => {
  const errors = watchErrors(page);
  await seniorMl(page);
  const box = priya(page).getByRole('checkbox');
  await box.focus();
  await page.keyboard.press('Space');
  await expect(box).toBeChecked();
  await expect(selection(page)).toBeVisible();
  await expect(profile(page)).toHaveCount(0);
  await expect(page).not.toHaveURL(/#\/candidate\//);
  await expect(box).toBeFocused();

  await page.keyboard.press('Space');
  await expect(box).not.toBeChecked();
  await expect(selection(page)).toHaveCount(0);
  await expect(profile(page)).toHaveCount(0);

  // Mouse ticking still selects, and a focused row still opens on Space.
  await priya(page).locator('.ml-dt-check').click();
  await expect(box).toBeChecked();
  await expect(profile(page)).toHaveCount(0);
  await priya(page).focus();
  await page.keyboard.press('Space');
  await expect(profile(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test('F12: Enter on a button inside a row does that button’s job; the panel says Send is simulated', async ({ page }) => {
  const errors = watchErrors(page);
  await seniorMl(page);
  await priya(page).getByRole('button', { name: /^Invite Priya Anand/ }).focus();
  await page.keyboard.press('Enter');
  const panel = page.getByRole('dialog', { name: 'Invite Priya Anand to a job' });
  await expect(panel).toBeVisible();
  await expect(profile(page)).toHaveCount(0);
  // The simulation notice comes before the Send button, not only after it.
  const notice = panel.getByText('Simulated — no message will be sent');
  const send = panel.getByRole('button', { name: 'Send invite' });
  expect((await notice.boundingBox())!.y).toBeLessThan((await send.boundingBox())!.y);
  expect(errors).toEqual([]);
});

const RULE = 'Each person goes to the first open job, in job order, that shortlists them, or else the first that has them as needs review.';

async function openBulkInvite(page: Page) {
  await page.getByRole('region', { name: 'Selected attendees', exact: true }).getByRole('button', { name: /Invite/ }).first().click();
  return page.getByRole('dialog', { name: /^Invite \d+ to / });
}

test('bulk invite preview states the targeting rule it applies, with and without a job filter', async ({ page }) => {
  const errors = watchErrors(page);
  // Filtered to Senior ML Engineer, everyone ticked: all 12 go to it (it is the first job that shortlists or reviews them).
  await seniorMl(page);
  await page.locator('thead .ml-dt-check').click();
  let panel = await openBulkInvite(page);
  await expect(panel.locator('.bulk-asks li')).toHaveCount(1);
  await expect(panel.locator('.bulk-asks')).toContainText('Senior ML Engineer · 12');
  await expect(panel).toContainText(RULE);
  await expect(panel).not.toContainText(/filter/i);

  // Filtered to Backend Engineer, Noah goes to Data Engineer: the rule, not the filter, picks the job.
  await seniorMl(page, 'Backend Engineer');
  await page.getByRole('row', { name: /Noah Anderson/ }).locator('.ml-dt-check').click();
  panel = await openBulkInvite(page);
  await expect(panel.locator('.bulk-asks')).toContainText('Data Engineer · 1');
  await expect(panel).toContainText(RULE);

  // No filter: same sentence, no mention of one.
  await seniorMl(page, null);
  await page.locator('tbody .ml-dt-check').first().click();
  panel = await openBulkInvite(page);
  if ((await panel.locator('.bulk-asks li').count()) > 0) await expect(panel).toContainText(RULE);
  await expect(panel).not.toContainText(/filter/i);
  expect(errors).toEqual([]);
});
