import { expect, test, type Page } from '@playwright/test';

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)\.com/.test(m.location().url + m.text())) errors.push(m.text());
  });
  return errors;
}

const PM = 'Senior Product Manager - Sports Data';
const notices = (page: Page) => page.getByRole('dialog', { name: 'Notifications' });
const groups = (page: Page) => page.getByRole('group', { name: 'Talent match' });
const group = (page: Page, name: 'Shortlist' | 'Needs review') => groups(page).getByRole('button', { name: new RegExp(`^${name} \\(`) });
const table = (page: Page, title: string, group: 'shortlist' | 'needs review') => page.getByRole('table', { name: `${title} — ${group}` });
const names = (page: Page, title: string, g: 'shortlist' | 'needs review') =>
  table(page, title, g).locator('tbody tr .hs-link').allInnerTexts();

test('a role’s needs-review queue: every person in it opens and Back keeps the group', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Close notifications' }).click();
  await page.getByRole('tab', { name: PM, exact: true }).click();
  await group(page, 'Needs review').click();
  await expect(group(page, 'Needs review')).toHaveAttribute('aria-pressed', 'true');
  await expect(group(page, 'Needs review')).toHaveText('Needs review (5)');
  await expect(page.getByText('5 records')).toBeVisible();
  const review = await names(page, PM, 'needs review');
  expect(review).toEqual(['Alex Turner', 'Elijah Allen', 'Claudia Vogel', 'Daniel Brown', 'Emma Lewis']);

  for (const name of review) {
    await table(page, PM, 'needs review').getByRole('button', { name }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeFocused();
    await expect(page.getByRole('region', { name: 'Talent match' }).getByTestId('tm-outcome')).toHaveText('Needs review');
    await page.getByRole('button', { name: 'Contacts' }).click();
    await expect(group(page, 'Needs review')).toHaveAttribute('aria-pressed', 'true');
    await expect(table(page, PM, 'needs review').locator('tbody tr')).toHaveCount(5);
  }

  // Zero means nobody in that group: the shortlist is truly empty.
  await group(page, 'Shortlist').click();
  await expect(group(page, 'Shortlist')).toHaveText('Shortlist (0)');
  await expect(page.getByText('0 records')).toBeVisible();
  await expect(page.getByText('No contacts match this view.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('JOB001’s six shortlisted and six needs-review people are each reachable from its role view', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Close notifications' }).click();
  await page.getByRole('tab', { name: 'Senior ML Engineer', exact: true }).click();
  await expect(group(page, 'Shortlist')).toHaveAttribute('aria-pressed', 'true');
  expect(await names(page, 'Senior ML Engineer', 'shortlist')).toEqual([
    'Priya Anand',
    'Chiara Russo',
    'Lucas Evans',
    'Marcus Reid',
    'Nathan Brooks',
    'James Thornton',
  ]);
  await group(page, 'Needs review').click();
  await expect(page.getByText('6 records')).toBeVisible();
  const review = await names(page, 'Senior ML Engineer', 'needs review');
  expect(review).toEqual(['Emily Carter', 'Adaora Okafor', 'Sara Lindqvist', 'Mason Young', 'Bruno Ferreira', 'Jin Park']);
  for (const name of review) {
    await table(page, 'Senior ML Engineer', 'needs review').getByRole('button', { name }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeFocused();
    await page.getByRole('button', { name: 'Contacts' }).click();
  }
  await expect(group(page, 'Needs review')).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('group counts follow an import and a new role', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Close notifications' }).click();
  await page.getByRole('button', { name: 'Import' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import contacts' });
  await dialog.getByRole('button', { name: 'Use sample file' }).click();
  await dialog.getByRole('button', { name: 'Import 5 rows' }).click();
  await notices(page).getByRole('button', { name: 'View results: Import finished: sample-conference-import.csv' }).click();
  await group(page, 'Needs review').click();
  await expect(group(page, 'Needs review')).toHaveText('Needs review (7)');
  await expect(group(page, 'Shortlist')).toHaveText('Shortlist (7)');
  await expect(table(page, 'Senior ML Engineer', 'needs review').locator('tbody tr')).toHaveCount(7);

  await page.getByRole('button', { name: 'Comeet', exact: true }).click();
  await page.getByRole('button', { name: 'New position' }).click();
  await page.getByRole('dialog', { name: 'New position' }).getByRole('button', { name: 'Publish position' }).click();
  await page.getByRole('button', { name: 'HubSpot', exact: true }).click();
  // A single-role notice states that role's counts; they match the saved view's groups.
  const line = notices(page).getByRole('listitem').filter({ hasText: 'New Comeet position: Computer Vision Engineer' });
  const [, shortlisted, count] = /(\d+) shortlist · (\d+) needs review\./.exec(await line.innerText())!.map(Number);
  await line.getByRole('button', { name: 'View results: New Comeet position: Computer Vision Engineer' }).click();
  await expect(page.getByRole('tab', { name: 'Computer Vision Engineer', selected: true })).toBeVisible();
  await expect(group(page, 'Shortlist')).toHaveText(`Shortlist (${shortlisted})`);
  await group(page, 'Needs review').click();
  await expect(group(page, 'Needs review')).toHaveText(`Needs review (${count})`);
  await expect(page.getByText(`${count} records`)).toBeVisible();
  expect(errors).toEqual([]);
});

test('event evidence is relevance to the event topic, separate from the job recommendation', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Close notifications' }).click();
  const jack = page.getByRole('table', { name: 'All contacts' }).getByRole('button', { name: 'Jack Thomas' });
  while (!(await jack.isVisible())) await page.getByRole('button', { name: 'Next ›' }).click();
  await jack.click();

  const card = page.getByRole('region', { name: 'Talent match' });
  const recent = page.getByRole('region', { name: 'Recent activities' });
  const line = 'Relevance to event topic (Sports Technology & Analytics): Relevant';
  await expect(card.getByRole('combobox', { name: 'Role' })).toHaveValue('JOB001');
  await expect(card.getByTestId('tm-outcome')).toHaveText('Not recommended for this role');
  await expect(recent).toContainText(line);
  await expect(recent).not.toContainText('this role');

  await card.getByRole('combobox', { name: 'Role' }).selectOption('JOB002');
  await expect(recent).toContainText(line);
  await expect(recent).not.toContainText('this role');
  expect(errors).toEqual([]);
});

test('New position keeps focus inside, blocks the background, closes on Escape and returns focus', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Comeet', exact: true }).click();
  const opener = page.getByRole('button', { name: 'New position' });
  await opener.click();
  const form = page.getByRole('dialog', { name: 'New position' });
  await expect(form).toBeFocused();
  const inside = () => form.evaluate((el) => el.contains(document.activeElement));

  // Six fields, Dismiss, Cancel, Publish: more presses than stops, both ways.
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await inside()).toBe(true);
  }
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await inside()).toBe(true);
  }

  // The app switch behind the dialog cannot be used.
  const hubspot = page.locator('.demo-hosts button').first();
  const box = (await hubspot.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(form).toBeVisible();
  await expect(hubspot).toHaveAttribute('aria-pressed', 'false');

  await page.keyboard.press('Escape');
  await expect(form).toHaveCount(0);
  await expect(opener).toBeFocused();

  // Cancel closes too; publishing still validates, then works.
  await opener.click();
  await form.getByRole('button', { name: 'Cancel' }).click();
  await expect(form).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  await form.getByLabel('Position title').fill('');
  await form.getByRole('button', { name: 'Publish position' }).click();
  await expect(form.getByRole('alert')).toHaveText('Add a position title.');
  expect(await inside()).toBe(true);
  await form.getByLabel('Position title').fill('Computer Vision Engineer');
  await form.getByLabel('Position title').press('Enter');
  await expect(form).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'Computer Vision Engineer' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('the sibling dialogs (Import, Add to Comeet) use the same containment and focus return', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Close notifications' }).click();
  const importButton = page.getByRole('button', { name: 'Import' });
  await importButton.click();
  const dialog = page.getByRole('dialog', { name: 'Import contacts' });
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(importButton).toBeFocused();

  await page.getByRole('tab', { name: 'Senior ML Engineer', exact: true }).click();
  await page.getByRole('table', { name: 'Senior ML Engineer — shortlist' }).getByRole('button', { name: 'Priya Anand' }).click();
  const add = page.getByRole('button', { name: 'Add to Comeet' });
  await add.click();
  const handoff = page.getByRole('dialog', { name: /Add .* to Comeet/ });
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    expect(await handoff.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(handoff).toHaveCount(0);
  await expect(add).toBeFocused();
  expect(errors).toEqual([]);
});
