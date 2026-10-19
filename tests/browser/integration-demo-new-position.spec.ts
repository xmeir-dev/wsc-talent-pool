import { expect, test, type Page } from '@playwright/test';
import { EDITED_SRE_COUNTS, SRE_DESCRIPTION, SRE_TITLE } from '../role-examples';

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)\.com/.test(m.location().url + m.text())) errors.push(m.text());
  });
  return errors;
}

const notices = (page: Page) => page.getByRole('dialog', { name: 'Notifications' });
const toApp = (page: Page, name: 'HubSpot' | 'Comeet') => page.getByRole('button', { name, exact: true }).click();
const group = (page: Page, name: 'Shortlist' | 'Needs review') =>
  page.getByRole('group', { name: 'Talent match' }).getByRole('button', { name: new RegExp(`^${name} \\(`) });

async function openNewPosition(page: Page) {
  await page.goto('/');
  await toApp(page, 'Comeet');
  await page.getByRole('button', { name: 'New position' }).click();
  return page.getByRole('dialog', { name: 'New position' });
}

test('New position: criteria suggested from the description, edited, then publish scores the pool by them', async ({ page }) => {
  const errors = watchErrors(page);
  const form = await openNewPosition(page);
  await form.getByLabel('Position title').fill(SRE_TITLE);
  await form.getByLabel('Job description').fill(SRE_DESCRIPTION);
  const criteria = form.getByRole('region', { name: 'Suggested criteria' });
  await expect(criteria).toContainText('Suggested by AI from the description · simulated · edit before publishing');
  for (const [i, skill] of ['Kubernetes', 'Terraform', 'CI/CD', 'Monitoring'].entries()) {
    await expect(criteria.getByRole('textbox', { name: `Core skill ${i + 1}` })).toHaveValue(skill);
  }
  await expect(criteria.getByRole('textbox', { name: 'Must-have skill 1' })).toHaveValue('AWS');
  await expect(criteria.locator('.np-row', { has: page.getByRole('textbox', { name: 'Must-have skill 1' }) })).toContainText(
    'From descriptionAWS experience is a must.',
  );

  // Edit one suggested row and remove another.
  await criteria.getByRole('textbox', { name: 'Required skill 4' }).fill('Docker');
  await criteria.getByRole('button', { name: 'Remove Go' }).click();
  await form.getByRole('button', { name: 'Publish position' }).click();
  await expect(page.getByRole('heading', { level: 1, name: SRE_TITLE })).toBeVisible();

  // What the engine gives for these confirmed criteria (asserted against the pipeline in tests/app/suggest-criteria.test.ts).
  const counts = EDITED_SRE_COUNTS;
  await toApp(page, 'HubSpot');
  const notice = notices(page).getByRole('listitem').filter({ hasText: `New Comeet position: ${SRE_TITLE}` });
  await expect(notice).toContainText(`${counts.shortlist} shortlist · ${counts.needs_review} needs review.`);
  await notice.getByRole('button', { name: `View results: New Comeet position: ${SRE_TITLE}`, exact: true }).click();
  await expect(group(page, 'Shortlist')).toHaveText(`Shortlist (${counts.shortlist})`);
  await expect(group(page, 'Needs review')).toHaveText(`Needs review (${counts.needs_review})`);
  expect(errors).toEqual([]);
});

test('New position labels inferred rows, quotes their sentence, and warns when no core skill is left', async ({ page }) => {
  const errors = watchErrors(page);
  const form = await openNewPosition(page);
  const criteria = form.getByRole('region', { name: 'Suggested criteria' });
  const pose = criteria.locator('.np-row', { has: page.getByRole('textbox', { name: 'Nice to have 3' }) });
  await expect(pose.getByRole('textbox')).toHaveValue('Pose Estimation');
  await expect(pose).toContainText('AI suggestion');
  await expect(pose.locator('q')).toContainText('track players and the ball');

  const warning = 'No core skills: any required skill counts as relevant (provisional).';
  await expect(criteria.getByText(warning)).toHaveCount(0);
  await criteria.getByRole('button', { name: 'Remove Computer Vision' }).first().click();
  await criteria.getByRole('button', { name: 'Remove Object Detection' }).first().click();
  await expect(criteria.getByText(warning)).toBeVisible();
  // Publishing is not blocked by it.
  await form.getByRole('button', { name: 'Publish position' }).click();
  await expect(form).toHaveCount(0);
  expect(errors).toEqual([]);
});
