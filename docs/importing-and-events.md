# Importing and event editions

How an attendee list gets into the pool: what is checked, what happens to a broken file, how repeat events are told apart, and why importing the same list twice is harmless. The same rules apply in the CLI (`data/` files), the recruiter view's **Add conference** and the integration demo's **Import**. Code: `pipeline/csv.ts`, `pipeline/events.ts`, `pipeline/dataset.ts` (`planAttendeeImport`), `view/importList.ts`, `integration-demo/sources.ts`.

## The whole file is checked before anything changes

1. **CSV structure, strictly** (`parseCsv`). These are errors, each reported with its line and column:
   - a quote that is opened and never closed. Before this fix, the rest of the file was read into that one value, so the next person silently disappeared;
   - a quote in the middle of an unquoted value, or text after a closing quote;
   - a row with more or fewer values than the header;
   - a header with a blank column name, a repeated name, or two names that differ only in capitals.

   Valid CSV still reads exactly: commas, line breaks and doubled quotes inside quotes, a UTF-8 byte order mark, and CRLF, LF or CR line endings. Blank lines are skipped.
2. **Columns and rows.** The required columns must be there. Every row needs a name and a conference. The integration demo also needs an email or LinkedIn URL on every row. `conference_date` must be a real `YYYY-MM-DD` date or blank. Missing optional data, such as a LinkedIn URL or the profile columns, is fine.
3. **The merged pool must still build.** The import is added to a copy of the source tables and the whole pool is rebuilt. If that fails, the error is shown and the copy is discarded.

Only when all three pass does the pool change. Any problem leaves the previous pool exactly as it was:

- the recruiter view shows "Nothing was added." with the first problems in the **Add conference** panel;
- the integration demo shows "… can't be imported. Nothing was changed." with the list, and no **Import** button;
- the CLI prints the problems and exits with status 1.

## Event editions

A conference name can have several editions: SportsTech Innovation Summit 2024 and 2026 are two events. Three identities are kept apart:

| Identity | What it is | Key |
|---|---|---|
| Person | Who attended ([identity and history](identity-and-history.md)) | `candidateKey`, from LinkedIn URL, email or source ID |
| Event edition | One run of a conference | `EventEdition.key` (below) |
| Attendance | One person at one edition | `attendanceId` = `A-` + hash of person ID + edition key |

The **edition key** is chosen in this order:

1. **A supplied event ID.** The optional `event_id` column, when filled, decides the edition: `id:<event_id>`. Use it when one name runs more than once within a few days, or when the organiser already has IDs.
2. **Name and date.** Rows with the same conference name (ignoring capitals and extra spaces) form one edition when their dates follow each other with gaps of at most 3 days (`EDITION_GAP_DAYS`). A two-day summit is therefore one edition, and next year's run is another. Key: `event:<name>|<first date>`.
3. **No date.** A row without a date cannot be placed in a dated edition. It becomes its own edition, `event:<name>|undated`, labelled "(date unknown)". It is never merged with a dated one, and the import preview and the build warnings say so.

**Labels.** An edition is shown by its name alone when it is the only one with that name. Otherwise the year is added ("SportsTech Innovation Summit (2026)"), or the first date if two editions share a year. The conference filter and the **At a glance** card in the recruiter view use the edition: each edition is its own choice, with its own count and date. The table's conference chips, the integration demo's contact list, lead source and event activity, the overnight notice's event count, the attendee download's `conference_name` and its file name all use the same label. The CRM CSV's `event_assessments` already lists each attendance's date and name, and adds `event <id>` when an event ID was supplied. The supplied data has four conferences, each a single edition (the two-day ones included), so its labels and outputs are unchanged.

## Repeated rows and retries

- **Same person, same edition** is one attendance. In the source files, several rows for one person at one edition (a second sign-up on day two, a re-entered row) are combined: the first row's details, every distinct note, every source ID on the person, and a data-quality flag ("2 records for … ; combined into one attendance").
- **Imports skip what is already recorded.** Before appending, each new row is checked against the pool by person and edition (`planAttendeeImport`). A row whose person is already recorded at that edition, in the pool or earlier in the same file, is skipped:
  - a **later batch** for the same event adds only the new people and new attendances. Nobody is duplicated;
  - the **exact same file again** adds nothing. The recruiter view says "Everyone on this list is already recorded for this event. Nothing changed." The integration demo says there is nothing to import and shows no **Import** button.
- **Another edition** of a known conference is accepted. Before this fix, the recruiter view rejected any list whose conference name was already in the pool.

An imported list still lives in memory until the page reloads. See [how long an imported person lasts](identity-and-history.md#how-long-an-imported-person-lasts).

## Tests

- `tests/csv-strict.test.ts`: the parser, both importers and the CLI on broken and valid files.
- `tests/event-editions.test.ts`: edition keys, labels, filters and counts, later batches, retries and undated rows.
- `e2e/import-editions.spec.ts` and `e2e/integration-demo-import.spec.ts`: the same cases in a real browser, including that a failed import leaves the pool unchanged.
