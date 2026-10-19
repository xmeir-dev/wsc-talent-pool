/**
 * The handoff walkthrough (real browser): the role's recruiter owns the Comeet record, the HubSpot contact owner and
 * marketing status stay as they were, the person lands on Comeet's Prospects tab as Sourced, every screen agrees,
 * and a repeat handoff creates nothing. Synthetic data only.
 */
import { expect, test, type Page } from '@playwright/test';

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)\.com/.test(m.location().url + m.text())) errors.push(m.text());
  });
  return errors;
}

const card = (page: Page) => page.getByRole('region', { name: 'Talent match' });
const handoff = (page: Page) => page.getByRole('dialog', { name: /Add .* to Comeet/ });
const keyInfo = (page: Page) => page.getByRole('region', { name: 'Key information' });
const toApp = (page: Page, name: 'HubSpot' | 'Comeet') => page.getByRole('button', { name, exact: true }).click();

async function openNeedsReview(page: Page, name: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Close notifications' }).click();
  await page.getByRole('tab', { name: 'Senior ML Engineer', exact: true }).click();
  await page.getByRole('group', { name: 'Talent match' }).getByRole('button', { name: /^Needs review/ }).click();
  await page.getByRole('table', { name: 'Senior ML Engineer — needs review' }).getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeFocused();
}

test('marketing-owned contact: handoff → Prospects tab, Sourced → status back in HubSpot, owner and marketing status kept', async ({ page }) => {
  const errors = watchErrors(page);
  await openNeedsReview(page, 'Emily Carter');
  await expect(keyInfo(page)).toContainText('Contact ownerMarketing · Noa Peretz');
  await expect(keyInfo(page)).toContainText('Contact typeCustomer contact · Talent lead');
  await expect(keyInfo(page)).toContainText('Lifecycle stageCustomer');
  await expect(keyInfo(page)).toContainText('Marketing contact statusMarketing contact');

  // The recruiter follows the role, not the contact.
  const role = card(page).getByRole('combobox', { name: 'Role' });
  await expect(card(page).getByTestId('tm-recruiter')).toHaveText('Recruiter for this role: Neta Harel');
  await role.selectOption('JOB003');
  await expect(card(page).getByTestId('tm-recruiter')).toHaveText('Recruiter for this role: Ronit Sela');
  await role.selectOption('JOB001');

  await card(page).getByRole('button', { name: 'Add to Comeet' }).click();
  await expect(handoff(page).getByTestId('handoff-owner')).toHaveText('Neta Harel');
  await handoff(page).getByRole('button', { name: 'Confirm' }).click();
  await expect(handoff(page)).toContainText('Added to Senior ML Engineer as Sourced.');
  await handoff(page).getByRole('button', { name: 'Open in Comeet' }).click();

  // Comeet: a prospect, not a candidate; status, stage, owner and next step agree.
  await expect(page.getByRole('tab', { name: 'Prospects (1)' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('complementary', { name: 'Prospects' }).getByRole('heading')).toHaveText('Prospects · Sourced (1)');
  const profile = page.getByRole('region', { name: 'Emily Carter profile' });
  await expect(profile.getByTestId('cm-status')).toHaveText('Sourced');
  await expect(profile).toContainText('Prospect');
  const workflow = page.getByRole('region', { name: 'Workflow' });
  await expect(workflow).toContainText('Sourced');
  await expect(workflow).toContainText('Step 1 of 4');
  await expect(workflow).toContainText('Neta reviews the fit and decides on outreach.');
  await expect(workflow).not.toContainText('Assign owner');
  await expect(page.getByRole('region', { name: 'Custom fields' })).toContainText('OwnerNeta Harel');
  await page.getByRole('tab', { name: 'Candidates' }).click();
  await expect(page.getByText('0 candidates')).toBeVisible();
  await expect(page.getByRole('button', { name: /Emily Carter/ })).toHaveCount(0);

  // Back in HubSpot: the Comeet status shows; the contact owner and marketing status did not move.
  await toApp(page, 'HubSpot');
  await expect(card(page).getByTestId('tm-comeet')).toHaveText('In Comeet: Sourced');
  await expect(page.getByTestId('hs-comeet-status')).toHaveText('Sourced');
  await expect(page.getByTestId('hs-owner')).toHaveText('Marketing · Noa Peretz');
  await expect(page.getByTestId('hs-marketing')).toHaveText('Marketing contact');
  await expect(page.getByTestId('hs-lifecycle')).toHaveText('Customer');
  expect(errors).toEqual([]);
});

test('a repeat handoff for the same person and role creates no duplicate', async ({ page }) => {
  const errors = watchErrors(page);
  await openNeedsReview(page, 'Emily Carter');
  await card(page).getByRole('button', { name: 'Add to Comeet' }).click();
  await handoff(page).getByRole('button', { name: 'Confirm' }).click();
  await handoff(page).getByRole('button', { name: 'Close' }).click();

  // The card now offers the existing record, not a second handoff.
  await expect(card(page).getByRole('button', { name: 'Add to Comeet' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Contacts' }).click();
  await page.getByRole('table', { name: 'Senior ML Engineer — needs review' }).getByRole('button', { name: 'Emily Carter', exact: true }).click();
  await expect(card(page).getByRole('button', { name: 'Add to Comeet' })).toHaveCount(0);
  await card(page).getByRole('button', { name: 'Open in Comeet' }).click();
  await expect(page.getByRole('tab', { name: 'Prospects (1)' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Prospects' }).getByRole('button', { name: /Emily Carter/ })).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('a pool contact is a non-marketing talent lead with a numeric record ID, a source ID and a split location', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Close notifications' }).click();
  await page.getByRole('tab', { name: 'Senior ML Engineer', exact: true }).click();
  await page.getByRole('table', { name: 'Senior ML Engineer — shortlist' }).getByRole('button', { name: 'Priya Anand' }).click();
  await expect(keyInfo(page)).toContainText('Contact ownerUnassigned');
  await expect(keyInfo(page)).toContainText('Contact typeTalent lead');
  await expect(keyInfo(page)).toContainText('Lifecycle stageLead');
  await expect(keyInfo(page)).toContainText('Marketing contact statusNon-marketing contact');
  const about = page.getByRole('region', { name: 'About this contact' });
  await expect(page.getByTestId('hs-record-id')).toHaveText('1002');
  await expect(about).toContainText('Source IDHS002');
  // The version is in the card's Details, not shown by default.
  await expect(card(page).getByText(/^JOB001 · rules-v\d+$/)).toBeHidden();
  expect(errors).toEqual([]);
});

test('the import preview says non-marketing once; an imported new contact gets lifecycle stage Other', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Close notifications' }).click();
  await page.getByRole('button', { name: 'Import' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import contacts' });
  await dialog.getByRole('button', { name: 'Use sample file' }).click();
  await expect(dialog.getByText(/Imported as non-marketing contacts\./)).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Import 5 contacts' }).click();
  await page.getByRole('button', { name: 'Close notifications' }).click();
  await page.getByRole('table', { name: 'All contacts' }).getByRole('button', { name: 'Noa Barak' }).click();
  await expect(page.getByTestId('hs-lifecycle')).toHaveText('Other');
  await expect(page.getByTestId('hs-marketing')).toHaveText('Non-marketing contact');
  const about = page.getByRole('region', { name: 'About this contact' });
  await expect(about).toContainText('CityTel Aviv');
  await expect(about).toContainText('Country/RegionIsrael');
  expect(errors).toEqual([]);
});
