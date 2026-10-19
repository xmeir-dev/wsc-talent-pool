/**
 * The saved outreach history: one transaction-safe store per browser origin.
 *
 * Why not localStorage: two tabs each held a copy and wrote the whole list back, so the later tab erased the
 * earlier tab's actions and both could send the same invite. Here every action is one IndexedDB readwrite
 * transaction that reads the current history, runs the same rules the buttons show (view/activity.ts) and
 * writes only if they still allow it. IndexedDB runs overlapping readwrite transactions one at a time across
 * all tabs of the origin, so a second tab's attempt sees the first tab's commit. A unique index on each
 * entry's dedupKey (person + role for invites, person + colleague for reference requests) backs this up.
 * After a commit the tab re-reads the store and tells the other tabs (BroadcastChannel) to re-read too.
 *
 * Stored state is versioned (STORE_VERSION). The first run reads the old v1 list (localStorage
 * "wsc-activity-v1") once: entries for a supplied person's published ID move over as they are; any other
 * key (an import's C-HS076, a name-based C-alex-review, a C-X-2 collision suffix) could belong to more than
 * one person, so it is held for review and blocks actions for whoever it might belong to. The v1 key is left
 * in place, never wiped. Without IndexedDB (blocked storage, unit tests) the same logic runs in memory for
 * this page only.
 */
import { useSyncExternalStore } from 'react';
import { identityBlock, isRegisteredPersonId } from '../pipeline';
import {
  actionGate,
  checkInvite,
  checkReference,
  comeetFor,
  dedupKeyFor,
  isEntry,
  knownPeople,
  linksOf,
  SEEDED,
  storedAsSomeoneElse,
  storedUnderOtherId,
  type Channel,
  type Entry,
  type HeldEntry,
  type HistoryState,
  type Outcome,
  type PersonRef,
  type SendState,
  type StoredPerson,
} from './activity';

export const DB_NAME = 'wsc-talent-pool';
/** Version of the stored state (the old localStorage list was version 1). */
export const STORE_VERSION = 2;
export const LEGACY_KEY = 'wsc-activity-v1';
/** Where an unreadable old history is copied, so nothing is lost. */
export const UNREADABLE_KEY = `${LEGACY_KEY}-unreadable`;
const CHANNEL = 'wsc-activity';

/** An entry as stored: its global order and, when it counts as contact, its dedup identity. */
type StoredEntry = Entry & { seq: number; dedupKey?: string };

export interface ActivityState extends HistoryState {
  /** False until the saved history has been read; actions are still checked against the store itself. */
  ready: boolean;
  /** Some old saved history could not be read (kept aside, see UNREADABLE_KEY). */
  unreadable: boolean;
  backend: 'indexeddb' | 'memory';
}

// ---------- Requests and the pure decision ----------

type Job = { jobId: string; title: string };
export type ActionRequest =
  | { kind: 'invite'; person: PersonRef; job: Job; otherJobs: readonly Job[]; channel: Channel; state: SendState }
  | { kind: 'reference'; person: PersonRef; employeeId: string; employeeName: string; channel: Channel; state: SendState; supersedes?: string }
  | { kind: 'outcome'; person: PersonRef; job: Job; outcome: Outcome }
  | { kind: 'do_not_contact'; person: PersonRef };

export type ActionResult = { ok: true; entry: Entry } | { ok: false; reason: string };

interface Saved {
  entries: StoredEntry[];
  people: Map<string, StoredPerson>;
  held: HeldEntry[];
  seq: number;
}

function toEntry(r: ActionRequest, id: string, at: string): Entry {
  const base = { id, at, by: 'You', simulated: true, candidateKey: r.person.candidateKey };
  switch (r.kind) {
    case 'invite':
      return { ...base, kind: 'invite', jobId: r.job.jobId, jobTitle: r.job.title, channel: r.channel, state: r.state };
    case 'reference':
      return {
        ...base,
        kind: 'reference',
        employeeId: r.employeeId,
        employeeName: r.employeeName,
        channel: r.channel,
        state: r.state,
        ...(r.supersedes && { supersedes: r.supersedes }),
      };
    case 'outcome':
      return { ...base, kind: 'outcome', jobId: r.job.jobId, jobTitle: r.job.title, outcome: r.outcome };
    case 'do_not_contact':
      return { ...base, kind: 'do_not_contact' };
  }
}

/**
 * Decide a batch against the current saved state: each request is checked against everything before it,
 * including earlier requests in the same batch. Pure, so both backends and the unit tests share it.
 */
export function decide(
  saved: Saved,
  requests: readonly ActionRequest[],
  now: number,
  newId: () => string,
): { results: ActionResult[]; entries: StoredEntry[]; people: StoredPerson[]; seq: number } {
  const at = new Date(now).toISOString();
  const entries: StoredEntry[] = [];
  const people = new Map(saved.people);
  const newPeople: StoredPerson[] = [];
  const taken = new Set(saved.entries.flatMap((e) => (e.dedupKey ? [e.dedupKey] : [])));
  let seq = saved.seq;
  const results = requests.map((r): ActionResult => {
    const state: HistoryState = { entries: [...SEEDED, ...saved.entries, ...entries], people, held: saved.held };
    const p = r.person;
    const gate = actionGate(state, p);
    if (gate) return { ok: false, reason: gate };
    const comeet = comeetFor(p.candidateKey);
    if (r.kind === 'invite') {
      const block = checkInvite(state.entries, comeet, p.candidateKey, r.job, r.otherJobs, now).block;
      if (block) return { ok: false, reason: block };
    }
    if (r.kind === 'reference') {
      const block = checkReference(state.entries, comeet, p.candidateKey, r.employeeId, r.employeeName).block;
      if (block) return { ok: false, reason: block };
    }
    const entry = toEntry(r, newId(), at);
    const dedupKey = dedupKeyFor(entry);
    if (dedupKey && taken.has(dedupKey)) return { ok: false, reason: r.kind === 'do_not_contact' ? 'Already recorded.' : 'Already recorded in another tab.' };
    if (dedupKey) taken.add(dedupKey);
    entries.push({ ...entry, seq: ++seq, ...(dedupKey && { dedupKey }) });
    // Remember who this is, and every identifier they now have that no one else with history owns.
    const before = people.get(p.candidateKey);
    const owned = knownPeople(people);
    const added = linksOf(p).filter((id) => !(before?.identifiers ?? []).includes(id) && (owned.get(id) ?? p.candidateKey) === p.candidateKey);
    if (!before || added.length > 0) {
      const stored: StoredPerson = before
        ? { ...before, identifiers: [...(before.identifiers ?? []), ...added].sort() }
        : { personId: p.candidateKey, anchor: p.identity.anchor, fullName: p.fullName, since: at, identifiers: [...added].sort() };
      people.set(p.candidateKey, stored);
      const i = newPeople.findIndex((x) => x.personId === stored.personId);
      if (i >= 0) newPeople[i] = stored;
      else newPeople.push(stored);
    }
    return { ok: true, entry };
  });
  return { results, entries, people: newPeople, seq };
}

/**
 * Identity links a dataset build accepted, kept whether or not anyone acts. For each person with saved history in
 * this browser whose identity is resolved and not under review, any identifier they now have that is not yet on
 * record (a LinkedIn URL added to an email-only person, a new email on a known URL, an email on a source-ID-only
 * person) is added to their stored record. Without this, a link learned by an import was lost on reload unless an
 * action happened to succeed, and a later import with the new identifier could start a second, empty history.
 * Never takes an identifier already on record for someone else (resolvePeople makes that person a conflict).
 * People with no saved history get nothing stored, so their IDs stay what the CLI gives them. Pure.
 */
export function acceptIdentities(saved: Pick<Saved, 'entries' | 'people'>, persons: readonly PersonRef[]): StoredPerson[] {
  const people = new Map(saved.people);
  const withEntries = new Set(saved.entries.map((e) => e.candidateKey));
  const changed = new Map<string, StoredPerson>();
  const at = new Date().toISOString();
  for (const p of persons) {
    const before = people.get(p.candidateKey);
    if (!before && !withEntries.has(p.candidateKey)) continue;
    if (identityBlock(p.identity) || storedAsSomeoneElse({ people }, p) || storedUnderOtherId({ people }, p)) continue;
    const owned = knownPeople(people);
    const have = new Set(before?.identifiers ?? []);
    const added = linksOf(p).filter((id) => !have.has(id) && (owned.get(id) ?? p.candidateKey) === p.candidateKey);
    if (before && added.length === 0) continue;
    const stored: StoredPerson = before
      ? { ...before, identifiers: [...have, ...added].sort() }
      : { personId: p.candidateKey, anchor: p.identity.anchor, fullName: p.fullName, since: at, identifiers: added.sort() };
    people.set(p.candidateKey, stored);
    changed.set(p.candidateKey, stored);
  }
  return [...changed.values()];
}

/**
 * The one-time move of the v1 list. Entries under a supplied person's published ID (C-HS001…) have one
 * possible owner and move as they are; anything else is held for review. Duplicate sent invites the old
 * store allowed are all kept, but only the first carries the dedup identity.
 */
export function migrateLegacy(raw: string | null): { entries: StoredEntry[]; held: HeldEntry[]; unreadable: boolean } {
  if (!raw) return { entries: [], held: [], unreadable: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = undefined;
  }
  const list = Array.isArray(parsed) ? parsed : [];
  const valid = list.filter(isEntry);
  const unreadable = !Array.isArray(parsed) || valid.length < list.length;
  const entries: StoredEntry[] = [];
  const held: HeldEntry[] = [];
  const taken = new Set<string>();
  valid.forEach((e, i) => {
    if (isRegisteredPersonId(e.candidateKey)) {
      const dedupKey = dedupKeyFor(e);
      const first = dedupKey !== undefined && !taken.has(dedupKey);
      if (first) taken.add(dedupKey!);
      entries.push({ ...e, seq: i + 1, ...(first && { dedupKey }) });
    } else held.push({ id: `held-${e.id}`, legacyKey: e.candidateKey, entry: e, notFor: [] });
  });
  return { entries, held, unreadable };
}

// ---------- Backends ----------

interface Backend {
  name: 'indexeddb' | 'memory';
  read(): Promise<Saved & { unreadable: boolean }>;
  /** Runs `change` on the current saved state inside one transaction and writes what it returns. */
  write<T>(change: (saved: Saved) => { result: T; put?: Partial<Pick<Saved, 'entries' | 'held'>> & { people?: StoredPerson[] }; seq?: number }): Promise<T>;
  clear(): Promise<void>;
}

function readLegacy(): string | null {
  try {
    return window.localStorage.getItem(LEGACY_KEY);
  } catch {
    return null;
  }
}
function keepUnreadable(raw: string | null) {
  try {
    if (raw) window.localStorage.setItem(UNREADABLE_KEY, raw);
  } catch {
    // Nothing more to do.
  }
}

function memoryBackend(): Backend {
  const legacy = typeof window === 'undefined' ? null : readLegacy();
  const m = migrateLegacy(legacy);
  if (m.unreadable) keepUnreadable(legacy);
  let saved: Saved = { entries: m.entries, people: new Map(), held: m.held, seq: m.entries.length };
  let unreadable = m.unreadable;
  let queue: Promise<unknown> = Promise.resolve();
  return {
    name: 'memory',
    read: async () => ({ ...saved, unreadable }),
    write(change) {
      const run = queue.then(() => {
        const { result, put, seq } = change(saved);
        const replace = new Map((put?.entries ?? []).map((e) => [e.id, e]));
        const heldById = new Map((put?.held ?? []).map((h) => [h.id, h]));
        saved = {
          entries: [...saved.entries.filter((e) => !replace.has(e.id)), ...replace.values()].sort((x, y) => x.seq - y.seq),
          people: new Map([...saved.people, ...(put?.people ?? []).map((p) => [p.personId, p] as const)]),
          held: [...saved.held.filter((h) => !heldById.has(h.id)), ...heldById.values()],
          seq: seq ?? saved.seq,
        };
        return result;
      });
      queue = run.catch(() => undefined);
      return run;
    },
    clear: async () => {
      saved = { entries: [], people: new Map(), held: [], seq: 0 };
      unreadable = false;
    },
  };
}

const STORES = ['entries', 'people', 'held', 'meta'] as const;
interface Meta {
  key: 'state';
  version: number;
  seq: number;
  /** How the v1 list was handled: 'migrated', 'none' (there was none) or 'cleared' (Reset). */
  legacy: 'migrated' | 'none' | 'cleared';
  unreadable: boolean;
}

const done = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
const finished = (t: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onabort = () => reject(t.error ?? new Error('Transaction aborted'));
    t.onerror = () => reject(t.error ?? new Error('Transaction failed'));
  });

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      const entries = db.createObjectStore('entries', { keyPath: 'id' });
      entries.createIndex('dedupKey', 'dedupKey', { unique: true });
      entries.createIndex('person', 'candidateKey');
      db.createObjectStore('people', { keyPath: 'personId' });
      db.createObjectStore('held', { keyPath: 'id' });
      db.createObjectStore('meta', { keyPath: 'key' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('IndexedDB upgrade blocked'));
  });
}

/** Reads all stores in one transaction; on a first run, migrates the v1 list in that same transaction. */
async function readAll(db: IDBDatabase, mode: IDBTransactionMode): Promise<{ t: IDBTransaction; saved: Saved; meta: Meta }> {
  const t = db.transaction(STORES, mode);
  const [entries, people, held, meta] = await Promise.all([
    done(t.objectStore('entries').getAll() as IDBRequest<StoredEntry[]>),
    done(t.objectStore('people').getAll() as IDBRequest<StoredPerson[]>),
    done(t.objectStore('held').getAll() as IDBRequest<HeldEntry[]>),
    done(t.objectStore('meta').get('state') as IDBRequest<Meta | undefined>),
  ]);
  return {
    t,
    saved: { entries: entries.sort((x, y) => x.seq - y.seq), people: new Map(people.map((p) => [p.personId, p])), held, seq: meta?.seq ?? 0 },
    meta: meta ?? { key: 'state', version: STORE_VERSION, seq: 0, legacy: 'none', unreadable: false },
  };
}

function indexedDbBackend(db: IDBDatabase): Backend {
  return {
    name: 'indexeddb',
    async read() {
      const { saved, meta } = await readAll(db, 'readonly');
      return { ...saved, unreadable: meta.unreadable };
    },
    async write(change) {
      const { t, saved, meta } = await readAll(db, 'readwrite');
      const end = finished(t);
      const { result, put, seq } = change(saved);
      for (const e of put?.entries ?? []) t.objectStore('entries').put(e);
      for (const p of put?.people ?? []) t.objectStore('people').put(p);
      for (const h of put?.held ?? []) t.objectStore('held').put(h);
      t.objectStore('meta').put({ ...meta, seq: seq ?? meta.seq });
      await end;
      return result;
    },
    async clear() {
      const t = db.transaction(STORES, 'readwrite');
      const end = finished(t);
      for (const s of ['entries', 'people', 'held'] as const) t.objectStore(s).clear();
      t.objectStore('meta').put({ key: 'state', version: STORE_VERSION, seq: 0, legacy: 'cleared', unreadable: false } satisfies Meta);
      await end;
    },
  };
}

/** First run on this origin: move the v1 list in one transaction; a second tab racing it finds the meta row and skips. */
async function migrateOnce(db: IDBDatabase) {
  const legacy = readLegacy();
  const t = db.transaction(STORES, 'readwrite');
  const end = finished(t);
  const meta = await done(t.objectStore('meta').get('state') as IDBRequest<Meta | undefined>);
  if (!meta) {
    const m = migrateLegacy(legacy);
    if (m.unreadable) keepUnreadable(legacy);
    for (const e of m.entries) t.objectStore('entries').put(e);
    for (const h of m.held) t.objectStore('held').put(h);
    t.objectStore('meta').put({
      key: 'state',
      version: STORE_VERSION,
      seq: m.entries.length,
      legacy: legacy ? 'migrated' : 'none',
      unreadable: m.unreadable,
    } satisfies Meta);
  }
  await end;
}

// ---------- The store the views subscribe to ----------

const EMPTY: ActivityState = { entries: SEEDED, people: new Map(), held: [], ready: false, unreadable: false, backend: 'memory' };
let snapshot: ActivityState = EMPTY;
const listeners = new Set<() => void>();
let channel: BroadcastChannel | null = null;

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? `a-${crypto.randomUUID()}` : `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

async function startBackend(): Promise<Backend> {
  if (typeof indexedDB === 'undefined') return memoryBackend();
  try {
    const db = await openDb();
    await migrateOnce(db);
    return indexedDbBackend(db);
  } catch {
    return memoryBackend(); // Private mode or blocked storage: this visit only.
  }
}
let backend: Promise<Backend> | null = null;
const getBackend = () => (backend ??= startBackend());

function publish(next: ActivityState) {
  snapshot = next;
  listeners.forEach((l) => l());
}

/** Re-reads the saved history (after this tab's commit, another tab's, or before a confirm). */
export async function refreshActivity(): Promise<ActivityState> {
  const b = await getBackend();
  const s = await b.read();
  publish({ entries: [...SEEDED, ...s.entries], people: s.people, held: s.held, ready: true, unreadable: s.unreadable, backend: b.name });
  return snapshot;
}

function announce() {
  try {
    channel?.postMessage('changed');
  } catch {
    // The other tabs refresh on their next action anyway.
  }
}

if (typeof window !== 'undefined') {
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = () => void refreshActivity();
  } catch {
    channel = null;
  }
  void refreshActivity();
}

/**
 * Records actions, each checked and written in one transaction against the history as it is now, not as this
 * tab last saw it. A refused action says why (e.g. "Already contacted for Data Engineer on 19 Oct.").
 */
export async function recordActions(requests: readonly ActionRequest[]): Promise<ActionResult[]> {
  const b = await getBackend();
  let results: ActionResult[];
  try {
    results = await b.write((saved) => {
      const d = decide(saved, requests, Date.now(), newId);
      return { result: d.results, put: { entries: d.entries, people: d.people }, seq: d.seq };
    });
  } catch (err) {
    // A uniqueness clash aborts the whole transaction: nothing was written.
    const reason = err instanceof DOMException && err.name === 'ConstraintError' ? 'Already recorded in another tab.' : 'Could not save. Nothing was recorded.';
    results = requests.map(() => ({ ok: false, reason }));
  }
  await refreshActivity();
  announce();
  return results;
}

/**
 * Saves the identity links a pool build accepted (acceptIdentities), in one transaction against the store as it is
 * now. The views call it whenever they build a pool, so a link learned by an import survives a reload even if no
 * action follows. Other tabs re-read and rebuild with it. Does nothing (no write) when there is nothing new.
 */
export async function rememberIdentities(persons: readonly PersonRef[]): Promise<void> {
  const b = await getBackend();
  if (acceptIdentities(await b.read(), persons).length === 0) return;
  let changed = 0;
  try {
    changed = await b.write((saved) => {
      const people = acceptIdentities(saved, persons);
      return { result: people.length, put: { people } };
    });
  } catch {
    return; // Not saved; the next build tries again, and actions still check identity in their own transaction.
  }
  if (changed === 0) return;
  await refreshActivity();
  announce();
}

/** A recruiter's decision on held v1 history: it is this person's (it joins their history) or it is not. */
export async function reviewHeld(heldId: string, person: PersonRef, belongs: boolean): Promise<void> {
  const b = await getBackend();
  await b.write((saved) => {
    const h = saved.held.find((x) => x.id === heldId);
    if (!h || h.assignedTo) return { result: undefined };
    if (!belongs) return { result: undefined, put: { held: [{ ...h, notFor: [...new Set([...h.notFor, person.candidateKey])] }] } };
    const entry = { ...h.entry, candidateKey: person.candidateKey } as Entry;
    const dedupKey = dedupKeyFor(entry);
    const clash = dedupKey && saved.entries.some((e) => e.dedupKey === dedupKey);
    const seq = saved.seq + 1;
    return {
      result: undefined,
      put: { held: [{ ...h, assignedTo: person.candidateKey }], entries: [{ ...entry, seq, ...(dedupKey && !clash && { dedupKey }) }] },
      seq,
    };
  });
  await refreshActivity();
  announce();
}

/**
 * Saved history under this ID was recorded for someone else's name. Same person: keep it and remember the name.
 * Different person: move it out of their history under a marked key (kept, not deleted).
 */
export async function reviewStoredPerson(person: PersonRef, same: boolean): Promise<void> {
  const b = await getBackend();
  await b.write((saved) => {
    const fingerprint: StoredPerson = {
      ...saved.people.get(person.candidateKey),
      personId: person.candidateKey,
      anchor: person.identity.anchor,
      fullName: person.fullName,
      since: new Date().toISOString(),
    };
    if (same) return { result: undefined, put: { people: [fingerprint] } };
    // Re-keyed in place: the entries leave this person's history (and stop counting for anyone) but stay in the store.
    const formerly = saved.people.get(person.candidateKey)?.fullName ?? 'someone else';
    const rekeyed = saved.entries
      .filter((e) => e.candidateKey === person.candidateKey)
      .map(({ dedupKey: _dedupKey, ...e }) => ({ ...e, candidateKey: `${e.candidateKey}~${formerly}` }) as StoredEntry);
    return { result: undefined, put: { entries: rekeyed, people: [fingerprint] } };
  });
  await refreshActivity();
  announce();
}

/** Reset demo: forget this browser's saved history (seeded examples stay). Explicit only; never on upgrade. */
export async function resetActivity(): Promise<void> {
  const b = await getBackend();
  await b.clear();
  await refreshActivity();
  announce();
}

export const activitySnapshot = (): ActivityState => snapshot;

export function useActivityState(): ActivityState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
    () => snapshot,
  );
}

/** Entries in force for display (seeded plus this browser's). */
export const useActivity = (): readonly Entry[] => useActivityState().entries;

/**
 * identifier → person ID from saved history, for buildDataset({ knownPeople }), so a person keeps the ID their
 * history is under. The same Map object is returned until the identifiers change, so the pool is not rebuilt per action.
 */
let knownCache: { signature: string; map: Map<string, string> } = { signature: '', map: new Map() };
export function useKnownPeople(): ReadonlyMap<string, string> {
  const map = knownPeople(useActivityState().people);
  const signature = JSON.stringify([...map]);
  if (signature !== knownCache.signature) knownCache = { signature, map };
  return knownCache.map;
}
