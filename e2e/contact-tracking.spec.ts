import { expect, test, type Page } from '@playwright/test';

/** Contact tracking (docs/contact-tracking-plan.md): simulated history, per-role status, block rules. */

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)\.com/.test(m.location().url + m.text())) errors.push(m.text());
  });
  return errors;
}

// Each test starts from the seeded examples only.
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.removeItem('wsc-activity-v1'));
});

test('seeded examples: declined one role, already in process, copied but not sent', async ({ page }) => {
  const errors = watchErrors(page);

  // Declined Backend Engineer, still open for Data Engineer (with a warning).
  await page.goto('/#/candidate/C-HS029');
  await expect(page.locator('.d-fit', { hasText: 'Backend Engineer' }).locator('.d-fit-comeet')).toHaveText(/Declined · 8 Oct · Simulated/);
  await expect(page.locator('.d-fit', { hasText: 'Data Engineer' }).locator('.d-fit-comeet')).toHaveText('Not contacted for this role');
  await page.getByRole('button', { name: 'Invite to job' }).click();
  await expect(page.locator('.ask .check-note')).toHaveText('Declined Backend Engineer on 8 Oct.');
  await expect(page.getByRole('button', { name: 'Send invite' })).toBeEnabled();
  await page.keyboard.press('Escape');

  // In process in Comeet: every new invite is blocked.
  await page.goto('/#/candidate/C-HS017');
  await page.getByRole('button', { name: 'Invite to job' }).click();
  await expect(page.locator('.ask .check-note')).toContainText('Already in process for Data Engineer in Comeet');
  await expect(page.getByRole('button', { name: 'Send invite' })).toBeDisabled();
  await page.keyboard.press('Escape');

  // An uncontacted Comeet lead does not block the first approach.
  await page.goto('/#/candidate/C-HS040');
  await page.getByRole('button', { name: 'Invite to job' }).click();
  await expect(page.getByRole('button', { name: 'Send invite' })).toBeEnabled();
  await page.keyboard.press('Escape');

  // Copied, never sent: prepared only; marking it sent then blocks a repeat request.
  await page.goto('/#/candidate/C-HS021');
  await expect(page.locator('.d-asked').first()).toContainText('Asked 14 Oct · Prepared · Simulated');
  await page.getByRole('button', { name: 'Mark sent' }).click();
  await expect(page.locator('.d-asked').first()).toContainText('Confirmed · Simulated');
  await page.getByRole('button', { name: /^Ask Noa/ }).click();
  await expect(page.locator('.ask .check-note')).toHaveText(/Noa was already asked/);
  await expect(page.getByRole('button', { name: 'Send in Slack' })).toBeDisabled();

  expect(errors).toEqual([]);
});

test('a simulated invite is kept after reload and blocks a repeat', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/#/candidate/C-HS029');
  await page.getByRole('button', { name: 'Invite to job' }).click();
  await page.getByRole('button', { name: 'Send invite' }).click();
  await expect(page.locator('.ask .ask-status')).toHaveText(/Sent · Simulated/);
  await page.keyboard.press('Escape');

  await page.reload();
  await expect(page.locator('.d-fit', { hasText: 'Data Engineer' }).locator('.d-fit-comeet')).toHaveText(/^Contacted · .* · Simulated$/);
  await expect(page.locator('.d-card', { hasText: 'Activity' }).first()).toContainText('Invited to Data Engineer');
  await page.getByRole('button', { name: 'Invite to job' }).click();
  await expect(page.locator('.ask .check-note')).toHaveText(/Already contacted for Data Engineer/);
  await expect(page.getByRole('button', { name: 'Send invite' })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('the Status filter narrows the list by outreach status', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.locator('.filters').getByRole('button', { name: /^Status/ }).click();
  const menu = page.getByRole('dialog', { name: 'Status' });
  await menu.getByRole('button', { name: /^Declined/ }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.list-count')).toHaveText('1 of 75 attendees');
  await expect(page.locator('table tbody tr')).toContainText(['Noah Anderson']);
  expect(errors).toEqual([]);
});
