import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * F1/F2: saved history follows the durable person ID across reloads and imports, and two tabs of the
 * recruiter app share one transaction-safe history (IndexedDB). Real browser, real tabs:
 * both pages live in one browser context, so they share the origin's storage exactly as two tabs do.
 */

const PRIYA = 'C-HS002';
const CHIARA = 'C-HS068';

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)\.com/.test(m.location().url + m.text())) errors.push(m.text());
  });
  return errors;
}

async function openProfile(context: BrowserContext, key: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`/#/candidate/${key}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  return page;
}

const inviteButton = (page: Page) => page.locator('.d-reach').getByRole('button', { name: 'Invite to job' });
const send = (page: Page) => page.getByRole('button', { name: 'Send invite' });
const activity = (page: Page) => page.locator('.d-card', { hasText: 'Activity' }).first();

/** Opens the invite panel and checks it is allowed, so the tab is acting on what it saw before the other tab acted. */
async function openInvite(page: Page) {
  await inviteButton(page).click();
  await expect(send(page)).toBeEnabled();
}

/** How many invites the store holds for one person, read straight from IndexedDB. */
function storedInvites(page: Page, key: string): Promise<number> {
  return page.evaluate(
    (personId) =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('wsc-talent-pool');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const all = open.result.transaction('entries').objectStore('entries').getAll();
          all.onsuccess = () => resolve((all.result as { kind: string; candidateKey: string; state: string }[]).filter((e) => e.kind === 'invite' && e.candidateKey === personId && e.state === 'sent').length);
          all.onerror = () => reject(all.error);
        };
      }),
    key,
  );
}

test('different people in two tabs opened before either acts: both invitations survive reload', async ({ context }) => {
  const a = await openProfile(context, PRIYA);
  const b = await openProfile(context, CHIARA);
  const errors = [...watchErrors(a), ...watchErrors(b)];
  await openInvite(a);
  await openInvite(b);

  await send(a).click();
  await expect(a.locator('.ask .ask-status')).toHaveText(/^Sent · Simulated/);
  await send(b).click();
  await expect(b.locator('.ask .ask-status')).toHaveText(/^Sent · Simulated/);

  for (const page of [a, b]) {
    await page.reload();
    await expect(activity(page)).toContainText('Invited to');
  }
  // Each tab now sees the other's action too: neither overwrote the other's history.
  await a.goto(`/#/candidate/${CHIARA}`);
  await expect(activity(a)).toContainText('Invited to');
  expect(await storedInvites(a, PRIYA)).toBe(1);
  expect(await storedInvites(a, CHIARA)).toBe(1);
  expect(errors).toEqual([]);
});

test('the same person in two tabs, one after the other: exactly one invitation, the second tab is told', async ({ context }) => {
  const a = await openProfile(context, PRIYA);
  const b = await openProfile(context, PRIYA);
  const errors = [...watchErrors(a), ...watchErrors(b)];
  await openInvite(a);
  await openInvite(b);

  await send(a).click();
  await expect(a.locator('.ask .ask-status')).toHaveText(/^Sent · Simulated/);
  // Tab B refreshes after A's commit: it now says why it cannot send, and Send is off.
  await expect(b.locator('.ask .check-note')).toHaveText(/^Already contacted for /);
  await expect(send(b)).toBeDisabled();
  await expect(b.locator('.ask .ask-status')).not.toHaveText(/Sent/);

  await b.reload();
  await expect(activity(b).locator('.d-activity li', { hasText: 'Invited to' })).toHaveCount(1);
  expect(await storedInvites(b, PRIYA)).toBe(1);
  expect(errors).toEqual([]);
});

test('the same person in two tabs at the same moment: exactly one succeeds, the other reports already contacted', async ({ context }) => {
  const a = await openProfile(context, PRIYA);
  const b = await openProfile(context, PRIYA);
  const errors = [...watchErrors(a), ...watchErrors(b)];
  await openInvite(a);
  await openInvite(b);

  // Fire both clicks together, bypassing any refresh between them: both tabs start their transaction on stale screens.
  const press = (page: Page) =>
    page.evaluate(() => {
      const button = [...document.querySelectorAll<HTMLButtonElement>('.ask button')].find((x) => x.textContent?.trim() === 'Send invite')!;
      button.click();
    });
  await Promise.all([press(a), press(b)]);

  const status = (page: Page) =>
    page.evaluate(() => {
      const text = document.querySelector('.ask .ask-status')?.textContent ?? '';
      const note = document.querySelector('.ask .check-note')?.textContent ?? '';
      return { sent: /^Sent · Simulated/.test(text), refused: /^Not sent: Already contacted for /.test(text) || /^Already contacted for /.test(note) };
    });
  await expect.poll(async () => [(await status(a)).sent || (await status(a)).refused, (await status(b)).sent || (await status(b)).refused]).toEqual([true, true]);
  const results = [await status(a), await status(b)];
  expect(results.filter((r) => r.sent)).toHaveLength(1);
  expect(results.filter((r) => r.refused && !r.sent)).toHaveLength(1);

  await a.reload();
  await expect(activity(a).locator('.d-activity li', { hasText: 'Invited to' })).toHaveCount(1);
  expect(await storedInvites(a, PRIYA)).toBe(1);
  expect(errors).toEqual([]);
});

test('the same person in two tabs at the same moment, ten times over: never two invitations', async ({ context }) => {
  // Repeats the race on fresh people so a lucky ordering cannot pass it: every pair must end with one invite.
  const people = ['C-HS003', 'C-HS004', 'C-HS005', 'C-HS006', 'C-HS007', 'C-HS008', 'C-HS009', 'C-HS010', 'C-HS011', 'C-HS012'];
  const a = await context.newPage();
  const b = await context.newPage();
  let raced = 0;
  for (const key of people) {
    await Promise.all([a.goto(`/#/candidate/${key}`), b.goto(`/#/candidate/${key}`)]);
    await expect(a.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(b.getByRole('heading', { level: 1 })).toBeVisible();
    // Only people with a fitting job show the button.
    if ((await inviteButton(a).count()) === 0) continue;
    await inviteButton(a).click();
    await inviteButton(b).click();
    // Only people the rules allow to be invited (an email, no active process) take part.
    if (!(await send(a).isEnabled()) || !(await send(b).isEnabled())) continue;
    raced++;
    await Promise.all(
      [a, b].map((page) =>
        page.evaluate(() => [...document.querySelectorAll<HTMLButtonElement>('.ask button')].find((x) => x.textContent?.trim() === 'Send invite')!.click()),
      ),
    );
    await expect.poll(() => storedInvites(a, key)).toBe(1);
    await a.waitForTimeout(150);
    const said = [await a.locator('.ask .ask-status').innerText(), await b.locator('.ask .ask-status').innerText()];
    expect(said.filter((t) => t.startsWith('Sent · Simulated'))).toHaveLength(1);
    expect(await storedInvites(a, key)).toBe(1);
  }
  expect(raced).toBeGreaterThanOrEqual(5);
});

test('history saved by the previous version is upgraded once, not lost', async ({ context }) => {
  const v1 = [
    { id: 'old-1', kind: 'invite', candidateKey: PRIYA, jobId: 'JOB001', jobTitle: 'Senior ML Engineer', channel: 'comeet', state: 'sent', simulated: true, by: 'You', at: '2026-10-18T10:00:00Z' },
  ];
  await context.addInitScript((raw) => {
    if (!localStorage.getItem('wsc-activity-v1')) localStorage.setItem('wsc-activity-v1', raw);
  }, JSON.stringify(v1));
  const page = await openProfile(context, PRIYA);
  await expect(activity(page)).toContainText('Invited to Senior ML Engineer');
  await page.reload();
  await expect(activity(page).locator('.d-activity li', { hasText: 'Invited to Senior ML Engineer' })).toHaveCount(1);
  // The old list is kept, untouched.
  expect(await page.evaluate(() => localStorage.getItem('wsc-activity-v1'))).toBe(JSON.stringify(v1));
});

test('two different Alex Reviews imported across reloads never share history; the same Alex gets hers back', async ({ page }) => {
  const errors = watchErrors(page);
  const importAlex = async (email: string) => {
    await page.goto('/');
    await page.reload(); // A real reload: the added conference from last time is gone.
    await page.getByRole('button', { name: 'Add conference' }).click();
    await page
      .getByRole('dialog', { name: 'Add a conference' })
      .locator('input[type=file]')
      .setInputFiles({
        name: 'review.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(`full_name,email,company,title,conference_name,conference_date\nAlex Review,${email},Acme,Data Engineer,Review Event,2026-10-19\n`),
      });
    await page.getByRole('row', { name: /Alex Review/ }).getByText('Alex Review').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Alex Review' })).toBeVisible();
  };

  // Alex A is invited; the added conference lives in memory only, so a reload drops her from the list.
  await importAlex('alex.a@example.test');
  await openInvite(page);
  await send(page).click();
  await expect(page.locator('.ask .ask-status')).toHaveText(/^Sent · Simulated/);

  // A different Alex Review (another email) imported after the reload inherits nothing.
  await importAlex('alex.b@example.test');
  await expect(activity(page)).not.toContainText('Invited to');
  await openInvite(page);
  await page.keyboard.press('Escape');

  // The same Alex A imported again is the same person: her invite is back and blocks a repeat.
  await importAlex('alex.a@example.test');
  await expect(activity(page)).toContainText('Invited to');
  await inviteButton(page).click();
  await expect(page.locator('.ask .check-note')).toHaveText(/^Already contacted for /);
  await expect(send(page)).toBeDisabled();
  expect(errors).toEqual([]);
});
