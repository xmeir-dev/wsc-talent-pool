import { expect, test, type Page } from '@playwright/test';

/**
 * An email → LinkedIn link learned by an import is saved when the import is accepted, not
 * only when an action succeeds. So after two reloads, the same LinkedIn URL with a new email is still the person
 * with the earlier invitation, and a second invitation is refused. Real browser, real reloads, IndexedDB.
 */

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)\.com/.test(m.location().url + m.text())) errors.push(m.text());
  });
  return errors;
}

const inviteButton = (page: Page) => page.locator('.d-reach').getByRole('button', { name: 'Invite to job' });
const send = (page: Page) => page.getByRole('button', { name: 'Send invite' });
const activity = (page: Page) => page.locator('.d-card', { hasText: 'Activity' }).first();

/** Fresh page (a real reload drops earlier imports), then Add conference with one Review Bridge row, then open her. */
async function importBridge(page: Page, email: string, linkedinUrl: string, reload = true) {
  if (reload) {
    await page.goto('/');
    await page.reload();
  }
  await page.getByRole('button', { name: 'Add conference' }).click();
  await page
    .getByRole('dialog', { name: 'Add a conference' })
    .locator('input[type=file]')
    .setInputFiles({
      name: 'review-bridge.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        `full_name,email,company,title,conference_name,conference_date,linkedin_url\nReview Bridge,${email},Acme,Data Engineer,Independent Review,2026-10-19,${linkedinUrl}\n`,
      ),
    });
  await page.getByRole('row', { name: /Review Bridge/ }).getByText('Review Bridge').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Review Bridge' })).toBeVisible();
}

/** Every sent invite in the store, read straight from IndexedDB. */
function sentInvites(page: Page): Promise<{ candidateKey: string; jobId: string }[]> {
  return page.evaluate(
    () =>
      new Promise<{ candidateKey: string; jobId: string }[]>((resolve, reject) => {
        const open = indexedDB.open('wsc-talent-pool');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const all = open.result.transaction('entries').objectStore('entries').getAll();
          all.onsuccess = () => {
            open.result.close();
            resolve((all.result as { kind: string; state: string; candidateKey: string; jobId: string }[]).filter((e) => e.kind === 'invite' && e.state === 'sent'));
          };
          all.onerror = () => reject(all.error);
        };
      }),
  );
}

/** The person ID the store has linked to an identifier, if any. */
function linkedTo(page: Page, identifier: string): Promise<string | undefined> {
  return page.evaluate(
    (id) =>
      new Promise<string | undefined>((resolve, reject) => {
        const open = indexedDB.open('wsc-talent-pool');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const all = open.result.transaction('people').objectStore('people').getAll();
          all.onsuccess = () => {
            open.result.close();
            resolve((all.result as { personId: string; identifiers?: string[] }[]).find((p) => p.identifiers?.includes(id))?.personId);
          };
          all.onerror = () => reject(all.error);
        };
      }),
    identifier,
  );
}

test('email, then email + LinkedIn (no action), then LinkedIn + new email: same person, history kept, no second invite', async ({ page }) => {
  const errors = watchErrors(page);

  // 1. Email only; invite to JOB001.
  await importBridge(page, 'bridge@example.test', '');
  await inviteButton(page).click();
  await send(page).click();
  await expect(page.locator('.ask .ask-status')).toHaveText(/^Sent · Simulated/);
  const firstUrl = page.url();
  const [first] = await sentInvites(page);
  expect(first).toMatchObject({ jobId: 'JOB001' });

  // 2. Reload; same email plus a LinkedIn URL. History is back. Deliberately no action here.
  await importBridge(page, 'bridge@example.test', 'linkedin.com/in/review-bridge');
  expect(page.url()).toBe(firstUrl);
  await expect(activity(page)).toContainText('Invited to');
  await expect.poll(() => linkedTo(page, 'linkedin:linkedin.com/in/review-bridge')).toBe(first!.candidateKey);

  // 3. Reload; same LinkedIn URL, new email. Still the same person: history shown, invite refused.
  await importBridge(page, 'bridge.new@example.test', 'linkedin.com/in/review-bridge');
  expect(page.url()).toBe(firstUrl);
  await expect(activity(page)).toContainText('Invited to');
  await inviteButton(page).click();
  await expect(page.locator('.ask .check-note')).toHaveText(/^Already contacted for /);
  await expect(send(page)).toBeDisabled();
  expect(await sentInvites(page)).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('a link learned in one tab is used by another tab that was already open', async ({ context }) => {
  const a = await context.newPage();
  const b = await context.newPage();
  const errors = [...watchErrors(a), ...watchErrors(b)];
  await b.goto('/'); // Open before tab A learns anything.

  await importBridge(a, 'bridge@example.test', '');
  await inviteButton(a).click();
  await send(a).click();
  await expect(a.locator('.ask .ask-status')).toHaveText(/^Sent · Simulated/);
  const personUrl = a.url();
  await importBridge(a, 'bridge@example.test', 'linkedin.com/in/review-bridge');
  const personId = decodeURIComponent(personUrl.split('#/candidate/')[1]!);
  await expect.poll(() => linkedTo(a, 'linkedin:linkedin.com/in/review-bridge')).toBe(personId);

  // Tab B never reloaded; its import of the URL with a new email finds the same person.
  await importBridge(b, 'bridge.new@example.test', 'linkedin.com/in/review-bridge', false);
  expect(b.url()).toBe(personUrl);
  await expect(activity(b)).toContainText('Invited to');
  await inviteButton(b).click();
  await expect(b.locator('.ask .check-note')).toHaveText(/^Already contacted for /);
  await expect(send(b)).toBeDisabled();
  expect(await sentInvites(b)).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('Ryan (in process in Comeet) with a new email, then a name variant with only that email after a reload: still held', async ({ page }) => {
  const errors = watchErrors(page);
  const add = async (name: string, email: string, url: string) => {
    await page.goto('/');
    await page.reload();
    await page.getByRole('button', { name: 'Add conference' }).click();
    await page
      .getByRole('dialog', { name: 'Add a conference' })
      .locator('input[type=file]')
      .setInputFiles({
        name: 'ryan.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(`full_name,email,company,title,conference_name,conference_date,linkedin_url\n${name},${email},DAZN,Data Engineer,Independent Review,2026-10-19,${url}\n`),
      });
    // The added conference's list: the name variant shows as the one Ryan it resolves to.
    await page.getByRole('row', { name: /Ryan/ }).getByText(/Ryan/).first().click();
    await expect(page.getByRole('heading', { level: 1, name: /Ryan/ })).toBeVisible();
  };

  await add('Ryan Patel', 'ryan.new@example.test', 'https://www.linkedin.com/in/ryan-patel-dazn');
  expect(page.url()).toMatch(/#\/candidate\/C-HS017$/);
  await expect.poll(() => linkedTo(page, 'email:ryan.new@example.test')).toBe('C-HS017');

  await add('Ryan J. Patel', 'ryan.new@example.test', '');
  expect(page.url()).toMatch(/#\/candidate\/C-HS017$/);
  await inviteButton(page).click();
  await expect(send(page)).toBeDisabled();
  expect(await sentInvites(page)).toHaveLength(0);
  expect(errors).toEqual([]);
});
