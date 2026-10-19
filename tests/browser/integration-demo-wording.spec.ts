import { expect, test, type Locator, type Page } from '@playwright/test';

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)\.com/.test(m.location().url + m.text())) errors.push(m.text());
  });
  return errors;
}

const search = (page: Page) => page.getByRole('searchbox', { name: 'Search contacts by name or email' });
const handoff = (page: Page) => page.getByRole('dialog', { name: /Add .* to Comeet/ });

/**
 * Everything on screen except the demo strip and the AI-criteria header, the two places allowed to say "simulated".
 * Product screens are drawn as the real product would show them.
 */
const productText = (page: Page) =>
  page.evaluate(() => {
    const body = document.body.cloneNode(true) as HTMLElement;
    body.querySelector('.demo-bar')?.remove();
    for (const p of body.querySelectorAll('p')) if (/^Suggested by AI/.test(p.textContent ?? '')) p.remove();
    return body.textContent ?? '';
  });

async function expectNoSimulated(page: Page) {
  expect(await productText(page)).not.toMatch(/simulated/i);
}

async function openFromAll(page: Page, query: string, name: string) {
  await page.getByRole('tab', { name: 'All contacts' }).click();
  await search(page).fill(query);
  await page.getByRole('table', { name: 'All contacts' }).getByRole('button', { name }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeFocused();
}

test('no product screen says "simulated": only the demo strip and the criteria header do', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expectNoSimulated(page);
  await page.getByRole('button', { name: 'Close notifications' }).click();
  await expectNoSimulated(page);

  // Seeded outreach history from the recruiter app (Gal Ofer, Neta Harel) shows who logged it, nothing more.
  await openFromAll(page, 'noah', 'Noah Anderson');
  await expect(page.getByRole('region', { name: 'Recent activities' })).toContainText('Gal Ofer');
  await expectNoSimulated(page);
  await page.getByRole('button', { name: 'Contacts' }).click();
  await openFromAll(page, 'alex turner', 'Alex Turner');
  await expect(page.getByRole('region', { name: 'Recent activities' })).toContainText('Neta Harel');
  await expectNoSimulated(page);

  await page.getByRole('button', { name: 'Add to Comeet' }).click();
  await expect(handoff(page)).toContainText('No email or message is sent.');
  await expectNoSimulated(page);
  await handoff(page).getByRole('button', { name: 'Confirm' }).click();
  await handoff(page).getByRole('button', { name: 'Open in Comeet' }).click();
  await expect(page.getByRole('region', { name: 'Custom fields' })).toBeVisible();
  await expectNoSimulated(page);

  await page.getByRole('button', { name: 'New position' }).click();
  await expect(page.getByRole('dialog', { name: 'New position' })).toBeVisible();
  await expectNoSimulated(page);
  expect(errors).toEqual([]);
});

test('the contact search filters the current view by name or email, any case', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Close notifications' }).click();
  const all = page.getByRole('table', { name: 'All contacts' });

  await search(page).fill('NOAH');
  await expect(all.locator('tbody tr')).toHaveCount(1);
  await expect(all.getByRole('button', { name: 'Noah Anderson' })).toBeVisible();

  // By email: every row left has the domain, and Emily is one of them.
  await search(page).fill('BroadcastAI.com');
  await expect(all.getByRole('button', { name: 'Emily Carter' })).toBeVisible();
  for (const email of await all.locator('tbody tr td:nth-child(3)').allInnerTexts()) expect(email.toLowerCase()).toContain('broadcastai.com');

  await search(page).fill('zzz-nobody');
  await expect(all.locator('tbody tr')).toHaveCount(1);
  await expect(all.locator('tbody tr')).toHaveText('No contacts match');

  // A role's saved view and group: the search narrows only that group.
  await search(page).fill('');
  await page.getByRole('tab', { name: 'Senior Product Manager - Sports Data', exact: true }).click();
  await page.getByRole('group', { name: 'Talent match' }).getByRole('button', { name: /^Needs review \(/ }).click();
  const review = page.getByRole('table', { name: 'Senior Product Manager - Sports Data — needs review' });
  await expect(review.locator('tbody tr')).toHaveCount(5);
  await search(page).fill('alex');
  await expect(review.locator('tbody tr .hs-link')).toHaveText(['Alex Turner']);
  await search(page).fill('');
  await expect(review.locator('tbody tr')).toHaveCount(5);
  expect(errors).toEqual([]);
});

test('handoff preview names the role only; Comeet shows Needs review in neutral text', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Close notifications' }).click();
  await openFromAll(page, 'emily carter', 'Emily Carter');
  await page.getByRole('button', { name: 'Add to Comeet' }).click();
  const assessment = handoff(page).locator('dt', { hasText: /^Assessment$/ }).locator('xpath=following-sibling::dd[1]');
  await expect(assessment).toHaveText('Senior ML Engineer');
  await handoff(page).getByRole('button', { name: 'Confirm' }).click();
  await handoff(page).getByRole('button', { name: 'Open in Comeet' }).click();

  const fields = page.getByRole('region', { name: 'Custom fields' });
  const fit = fields.locator('.cm-fit');
  await expect(fit).toHaveText('Needs review');
  // The data field keeps its version; only the color changes.
  await expect(fields).toContainText(/rules-v\d+/);
  const color = (l: Locator) => l.evaluate((el) => getComputedStyle(el).color);
  const neutral = await color(fields.locator('dd').nth(1));
  expect(await color(fit)).toBe(neutral);
  expect(errors).toEqual([]);
});

test('Emily Carter’s email breaks at the @ on the contact record', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Close notifications' }).click();
  await openFromAll(page, 'emily carter', 'Emily Carter');
  const email = page.locator('.hs-email .hs-underline');
  await expect(email).toHaveText('emily.carter@broadcastai.com');
  // Each part (name, then @domain) sits whole on one line: any wrap falls at the @.
  const linesPerPart = await email.evaluate((el) =>
    [...el.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent)
      .map((n) => {
        const range = document.createRange();
        range.selectNodeContents(n);
        return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
      }),
  );
  expect(linesPerPart).toEqual([1, 1]);
});

test.describe('narrow screen', () => {
  test.use({ viewport: { width: 390, height: 800 } });

  /** The dialog's title and close button are not under the demo strip: clear of it, or the dialog stacks above it. */
  async function expectUncovered(dialog: Locator) {
    for (const target of [dialog.getByRole('heading', { level: 2 }).first(), dialog.getByRole('button', { name: 'Dismiss' })]) {
      await expect(target).toBeVisible();
      const covered = await target.evaluate((el) => {
        const strip = document.querySelector('.demo-bar')!;
        if (el.getBoundingClientRect().top >= strip.getBoundingClientRect().bottom) return false;
        let layer: Element | null = el;
        while (layer && getComputedStyle(layer).position !== 'fixed') layer = layer.parentElement;
        return !layer || Number(getComputedStyle(layer).zIndex) <= Number(getComputedStyle(strip).zIndex);
      });
      expect(covered).toBe(false);
    }
    expect(await dialog.page().evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  }

  test('New position, Add to Comeet and Import dialogs are not covered by the demo strip', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Close notifications' }).click();

    // New position lives in Comeet's desktop sidebar; open it wide, then narrow the window (as Import below).
    await page.getByRole('button', { name: 'Comeet', exact: true }).click();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByRole('button', { name: 'New position' }).click();
    await page.setViewportSize({ width: 390, height: 800 });
    const np = page.getByRole('dialog', { name: 'New position' });
    await expectUncovered(np);
    await np.getByRole('button', { name: 'Dismiss' }).click();

    await page.getByRole('button', { name: 'HubSpot', exact: true }).click();
    await openFromAll(page, 'emily carter', 'Emily Carter');
    await page.getByRole('button', { name: 'Add to Comeet' }).click();
    await expectUncovered(handoff(page));
    await handoff(page).getByRole('button', { name: 'Dismiss' }).click();

    // Import lives with the desktop actions; open it wide, then narrow the window.
    await page.getByRole('button', { name: 'Contacts' }).click();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByRole('button', { name: 'Import' }).click();
    await page.setViewportSize({ width: 390, height: 800 });
    await expectUncovered(page.getByRole('dialog', { name: 'Import contacts' }));
    expect(errors).toEqual([]);
  });
});
