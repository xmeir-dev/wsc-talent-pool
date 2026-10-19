import { expect, test, type Page } from '@playwright/test';

/** Fails the test on any console error or uncaught page error (web-font fetches excepted when offline). */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)\.com/.test(m.location().url + m.text())) errors.push(m.text());
  });
  return errors;
}

const shortlist = (page: Page) => page.getByRole('table', { name: 'Senior ML Engineer — shortlist' });
const handoff = (page: Page) => page.getByRole('dialog', { name: /Add .* to Comeet/ });
const notices = (page: Page) => page.getByRole('dialog', { name: 'Notifications' });
const card = (page: Page) => page.getByRole('region', { name: 'Talent match' });
const toApp = (page: Page, name: 'HubSpot' | 'Comeet') => page.getByRole('button', { name, exact: true }).click();

async function openShortlist(page: Page) {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Senior ML Engineer — shortlist' }).click();
}

async function openContact(page: Page, name: string) {
  await openShortlist(page);
  await shortlist(page).getByRole('button', { name }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeFocused();
}

test('morning after: the overnight notice leads to the shortlist, then card → handoff → Comeet record', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(page.getByText('Integration concept · synthetic data · no live connection.')).toBeVisible();
  await expect(notices(page)).toContainText('Talent match ran overnight');
  await expect(notices(page)).toContainText('75 conference contacts from 4 events scored for 4 open roles.');
  await notices(page).getByRole('button', { name: 'Senior ML Engineer: 6 shortlist · 6 to review' }).click();
  await expect(notices(page)).toHaveCount(0);
  await expect(shortlist(page).locator('tbody tr')).toHaveCount(6);
  await expect(shortlist(page).locator('tbody tr').first()).toContainText('Priya Anand');

  await shortlist(page).getByRole('button', { name: 'Priya Anand' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Priya Anand' })).toBeFocused();
  await expect(card(page).getByTestId('tm-outcome')).toHaveText('Shortlist · #1');
  await expect(card(page)).toContainText('Leads, not endorsements.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

  await card(page).getByRole('button', { name: 'Add to Comeet' }).focus();
  await page.keyboard.press('Enter');
  await expect(handoff(page)).toContainText('Senior ML Engineer');
  await handoff(page).getByRole('button', { name: 'Confirm' }).press('Enter');
  await expect(handoff(page)).toContainText('Added to Senior ML Engineer as Sourced.');

  await handoff(page).getByRole('button', { name: 'Open in Comeet' }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Priya Anand' })).toBeFocused();
  await expect(page.getByTestId('cm-status')).toHaveText('Sourced');
  await expect(page.getByRole('region', { name: 'Custom fields' })).toContainText('Shortlist · #1');
  await expect(page.getByRole('region', { name: 'Custom fields' })).toContainText('rules-v3');
  expect(errors).toEqual([]);
});

test('Comeet status flows back to HubSpot: card, record and list', async ({ page }) => {
  const errors = watchErrors(page);
  await openContact(page, 'Chiara Russo');
  await expect(page.getByTestId('hs-comeet-status')).toHaveText('--');
  await card(page).getByRole('button', { name: 'Add to Comeet' }).click();
  await handoff(page).getByRole('button', { name: 'Confirm' }).click();
  await handoff(page).getByRole('button', { name: 'Close' }).click();

  await expect(card(page).getByTestId('tm-comeet')).toHaveText('In Comeet: Sourced · Owner: Unassigned');
  await expect(card(page).getByRole('button', { name: 'Add to Comeet' })).toHaveCount(0);
  await expect(page.getByTestId('hs-comeet-status')).toHaveText('Sourced');

  await page.getByRole('button', { name: 'Contacts' }).click();
  const row = (name: string) => shortlist(page).getByRole('row', { name: new RegExp(name) });
  await expect(row('Chiara Russo').getByTestId('comeet-status')).toHaveText('Sourced');
  await expect(row('Lucas Evans').getByTestId('comeet-status')).toHaveText('In progress · Phone screen');
  await expect(row('Priya Anand').getByTestId('comeet-status')).toHaveText('--');

  // Open in Comeet from the card goes to the same record: no second handoff.
  await row('Chiara Russo').getByRole('button', { name: 'Chiara Russo' }).click();
  await card(page).getByRole('button', { name: 'Open in Comeet' }).click();
  await expect(page.getByRole('complementary', { name: 'Candidates' }).getByRole('button', { name: /Chiara Russo/ })).toHaveCount(
    1,
  );
  expect(errors).toEqual([]);
});

test('role switching reads each stored assessment without losing the first', async ({ page }) => {
  const errors = watchErrors(page);
  await openContact(page, 'Priya Anand');
  const role = card(page).getByRole('combobox', { name: 'Role' });
  await role.selectOption('JOB002');
  await expect(card(page).getByTestId('tm-outcome')).toHaveText('Not recommended for this role');
  await expect(card(page)).toContainText('JOB002 · rules-v3');
  await role.selectOption('JOB001');
  await expect(card(page).getByTestId('tm-outcome')).toHaveText('Shortlist · #1');

  // The handoff goes to the role selected in the card.
  await role.selectOption('JOB004');
  await card(page).getByRole('button', { name: 'Add to Comeet' }).click();
  await expect(handoff(page)).toContainText('Data Engineer');
  expect(errors).toEqual([]);
});

test('importing a spreadsheet adds contacts, merges a repeat attendee and re-scores the roles', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Close notifications' }).click();
  await expect(page.getByText('75 records')).toBeVisible();

  await page.getByRole('button', { name: 'Import' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import contacts' });
  await dialog.getByRole('button', { name: 'Use sample file' }).click();
  await expect(dialog).toContainText('5 rows from Sports Video AI Meetup');
  await expect(dialog).toContainText('4 new contacts · 1 added as an event to an existing contact');
  await dialog.getByRole('button', { name: 'Import 5 contacts' }).click();

  await expect(page.getByText('79 records')).toBeVisible();
  await expect(notices(page)).toContainText('Import finished: sample-conference-import.csv');
  await notices(page).getByRole('button', { name: 'Senior ML Engineer: 7 shortlist · 7 to review' }).click();
  await expect(shortlist(page).locator('tbody tr').first()).toContainText('Noa Barak');

  // A bad file imports nothing.
  await page.getByRole('tab', { name: 'All contacts' }).click();
  await page.getByRole('button', { name: 'Import' }).click();
  await dialog
    .locator('input[type=file]')
    .setInputFiles({ name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('name,phone\nA,1\n') });
  await expect(dialog).toContainText("bad.csv can't be imported. Nothing was changed.");
  await expect(dialog.getByRole('button', { name: /^Import \d/ })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.getByText('79 records')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a new Comeet position is scored and appears in HubSpot as a saved view', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await toApp(page, 'Comeet');
  await page.getByRole('button', { name: 'New position' }).click();
  const form = page.getByRole('dialog', { name: 'New position' });
  await form.getByLabel('Position title').fill('');
  await form.getByRole('button', { name: 'Publish position' }).click();
  await expect(form).toContainText('Add a position title.');
  await form.getByLabel('Position title').fill('Computer Vision Engineer');
  await form.getByRole('button', { name: 'Publish position' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Computer Vision Engineer' })).toBeVisible();

  await toApp(page, 'HubSpot');
  await expect(notices(page)).toContainText('New Comeet position: Computer Vision Engineer');
  await notices(page)
    .getByRole('button', { name: /^Computer Vision Engineer: \d+ shortlist/ })
    .click();
  await expect(page.getByRole('tab', { name: 'Computer Vision Engineer — shortlist', selected: true })).toBeVisible();
  await expect(
    page.getByRole('table', { name: 'Computer Vision Engineer — shortlist' }).locator('tbody tr').first(),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('Comeet opens on its own; a person already in a process shows the owner and next step', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await toApp(page, 'Comeet');
  await expect(page.getByRole('heading', { level: 1, name: 'Senior ML Engineer' })).toBeVisible();
  await page.getByRole('button', { name: /Lucas Evans/ }).click();
  await expect(page.getByTestId('cm-status')).toHaveText('In progress · Phone screen');
  await expect(page.getByRole('region', { name: 'Workflow' })).toContainText('Check with Dana before contacting Lucas.');
  expect(errors).toEqual([]);
});

test('Reset demo clears handoffs', async ({ page }) => {
  const errors = watchErrors(page);
  await openContact(page, 'James Thornton');
  await card(page).getByRole('button', { name: 'Add to Comeet' }).click();
  await handoff(page).getByRole('button', { name: 'Confirm' }).click();
  await expect(handoff(page)).toContainText('Added to Senior ML Engineer as Sourced.');
  await handoff(page).getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'Reset demo' }).click();
  await expect(notices(page)).toContainText('Talent match ran overnight');
  await notices(page).getByRole('button', { name: 'Senior ML Engineer: 6 shortlist · 6 to review' }).click();
  await shortlist(page).getByRole('button', { name: 'James Thornton' }).click();
  await expect(card(page).getByRole('button', { name: 'Add to Comeet' })).toBeVisible();
  expect(errors).toEqual([]);
});

test.describe('narrow screen', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('no horizontal page overflow on any screen', async ({ page }) => {
    const errors = watchErrors(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await page.goto('/');
    expect(await overflow()).toBeLessThanOrEqual(0);
    await notices(page)
      .getByRole('button', { name: /^Senior ML Engineer:/ })
      .click();
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
