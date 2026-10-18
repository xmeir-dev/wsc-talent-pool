import { expect, test, type Page } from '@playwright/test';

/** Fails the test on any console error or uncaught page error. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

const shortlist = (page: Page) => page.getByRole('table', { name: 'Senior ML Engineer — shortlist' });
const handoff = (page: Page) => page.getByRole('dialog', { name: /Add .* to Comeet/ });

async function openContact(page: Page, name: string) {
  await page.goto('/');
  await shortlist(page).getByRole('button', { name }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeFocused();
}

test('keyboard journey: shortlist → contact card → handoff → Comeet record', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(page.getByText('Integration concept · synthetic data · no live connection.')).toBeVisible();
  await expect(shortlist(page).locator('tbody tr')).toHaveCount(7);
  await expect(shortlist(page).locator('tbody tr').first()).toContainText('Priya Anand');

  await shortlist(page).getByRole('button', { name: 'Priya Anand' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Priya Anand' })).toBeFocused();
  const card = page.getByRole('region', { name: 'Talent match' });
  await expect(card.getByTestId('tm-outcome')).toHaveText('Shortlist · #1');
  await expect(card).toContainText('Leads, not endorsements.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

  await card.getByRole('button', { name: 'Add to Comeet' }).focus();
  await page.keyboard.press('Enter');
  const dialog = handoff(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Senior ML Engineer');
  await expect(dialog).toContainText('Sourced');
  await expect(dialog.getByRole('button', { name: 'Confirm' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirm' }).press('Enter');
  await expect(dialog).toContainText('Added to Senior ML Engineer as Sourced.');

  await dialog.getByRole('button', { name: 'Open in Comeet' }).press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Priya Anand' })).toBeFocused();
  await expect(page.getByTestId('cm-status')).toHaveText('Sourced');
  await expect(page.getByRole('region', { name: 'Custom fields' })).toContainText('Shortlist · #1');
  await expect(page.getByRole('region', { name: 'Custom fields' })).toContainText('rules-v2');
  expect(errors).toEqual([]);
});

test('role switching reads each stored assessment without losing the first', async ({ page }) => {
  const errors = watchErrors(page);
  await openContact(page, 'Priya Anand');
  const card = page.getByRole('region', { name: 'Talent match' });
  const role = card.getByRole('combobox', { name: 'Role' });
  await role.selectOption('JOB002');
  await expect(card.getByTestId('tm-outcome')).toHaveText('Not recommended for this role');
  await expect(card).toContainText('JOB002 · rules-v2');
  await role.selectOption('JOB001');
  await expect(card.getByTestId('tm-outcome')).toHaveText('Shortlist · #1');

  // The handoff goes to the role selected in the card.
  await role.selectOption('JOB004');
  await card.getByRole('button', { name: 'Add to Comeet' }).click();
  await expect(handoff(page)).toContainText('Data Engineer');
  expect(errors).toEqual([]);
});

test('repeating a handoff links to the same record instead of creating another', async ({ page }) => {
  const errors = watchErrors(page);
  await openContact(page, 'Chiara Russo');
  const card = page.getByRole('region', { name: 'Talent match' });
  await card.getByRole('button', { name: 'Add to Comeet' }).click();
  await handoff(page).getByRole('button', { name: 'Confirm' }).click();
  await handoff(page).getByRole('button', { name: 'Open in Comeet' }).click();
  const firstId = await page.locator('.cm-head .muted').textContent();

  await page.getByRole('button', { name: '← Back to HubSpot' }).click();
  await card.getByRole('button', { name: 'Add to Comeet' }).click();
  await expect(handoff(page)).toContainText('Already in Comeet for Senior ML Engineer');
  await expect(handoff(page).getByRole('button', { name: 'Confirm' })).toHaveCount(0);
  await handoff(page).getByRole('button', { name: 'Open in Comeet' }).click();
  await expect(page.locator('.cm-head .muted')).toHaveText(firstId!);
  expect(errors).toEqual([]);
});

test('a person already in a Comeet process shows the owner and next step', async ({ page }) => {
  const errors = watchErrors(page);
  await openContact(page, 'Lucas Evans');
  await page.getByRole('button', { name: 'Add to Comeet' }).click();
  await expect(handoff(page)).toContainText('Owner: Dana (fictional recruiter)');
  await expect(handoff(page)).toContainText('Check with Dana before contacting Lucas.');
  await handoff(page).getByRole('button', { name: 'Open in Comeet' }).click();
  await expect(page.getByTestId('cm-status')).toHaveText('Active · Phone screen');
  expect(errors).toEqual([]);
});

test('an outage never reads as success and creates nothing; Reset demo clears handoffs', async ({ page }) => {
  const errors = watchErrors(page);
  await openContact(page, 'Mason Young');
  await page.getByRole('button', { name: 'Add to Comeet' }).click();
  await handoff(page).getByRole('button', { name: 'Confirm' }).waitFor();

  await page.getByLabel('Simulate Comeet outage').check();
  await handoff(page).getByRole('button', { name: 'Confirm' }).click();
  await expect(handoff(page)).toContainText('Comeet did not respond. Nothing was created.');
  await expect(handoff(page).getByRole('button', { name: 'Open in Comeet' })).toHaveCount(0);

  await page.getByLabel('Simulate Comeet outage').uncheck();
  await handoff(page).getByRole('button', { name: 'Try again' }).click();
  await expect(handoff(page).getByRole('button', { name: 'Confirm' })).toBeVisible();
  await handoff(page).getByRole('button', { name: 'Confirm' }).click();
  await expect(handoff(page)).toContainText('Added to Senior ML Engineer as Sourced.');
  await handoff(page).getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'Reset demo' }).click();
  await expect(shortlist(page)).toBeVisible();
  await shortlist(page).getByRole('button', { name: 'Mason Young' }).click();
  await page.getByRole('button', { name: 'Add to Comeet' }).click();
  await expect(handoff(page).getByRole('button', { name: 'Confirm' })).toBeVisible();
  expect(errors).toEqual([]);
});

test.describe('narrow screen', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('no horizontal page overflow on any screen', async ({ page }) => {
    const errors = watchErrors(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await page.goto('/');
    expect(await overflow()).toBeLessThanOrEqual(0);
    await shortlist(page).getByRole('button', { name: 'Priya Anand' }).click();
    expect(await overflow()).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Add to Comeet' }).click();
    await handoff(page).getByRole('button', { name: 'Confirm' }).click();
    await handoff(page).getByRole('button', { name: 'Open in Comeet' }).click();
    expect(await overflow()).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });
});
