# Importing and event editions

**A broken attendee list changes nothing. Re-importing the same list adds no duplicates.** Returning attendees keep one record, while separate runs of a conference remain separate events.

## The whole file is checked before anything changes

1. **Read the CSV strictly.** Reject broken quotes, uneven row lengths, blank headers and duplicate headers, including names differing only in capitals. Errors identify line and column. Quoted commas, line breaks and doubled quotes are valid; blank lines, a UTF-8 byte order mark and standard line endings are supported.
2. **Check required data.** Refuse missing required columns, header-only attendee files and invalid dates. Dates must be real `YYYY-MM-DD` values or blank. Both browser importers require a name and conference on each row; the integration demo also requires an email or LinkedIn URL. Missing optional profile data is allowed.
3. **Rebuild before applying.** Merge into a copy and validate the resulting pool. Apply it only if the whole build succeeds.

On failure, the recruiter view says **“Nothing was added.”** The integration demo lists problems and disables import. The CLI reports validation errors and exits with status 1. No partial import is applied.

Each import builds on the newest pool. A responses-sheet link that finishes loading after another import adds to the merged pool instead of replacing it.

The recruiter view requires columns `full_name`, `email`, `conference_name` and `conference_date`; email values may be blank. The integration demo requires `full_name`, `conference_name`, and either `email` or `linkedin_url`, with identifying values on every row. For CLI input, use the four [supplied CSVs](../../data/) as templates; the parser defines [required and optional columns](../../pipeline/dataset.ts).

## Event editions

One person can attend several editions of the same conference. Each person–edition pair is one attendance, separate from the person's [durable ID](identity-and-history.md#person-id).

| Available data | Edition rule |
|---|---|
| `event_id` supplied | Use that ID. Best for closely spaced events or an organizer's existing IDs. |
| Name and date | Normalize name spacing and capitals. Dates with gaps of at most 3 days form one edition; another year's run is separate. |
| No date | Keep an undated edition for that name, labelled “date unknown”. Never merge it into a dated edition. |

Rows with and without an event ID stay separate even when names and dates overlap. A warning asks for consistent IDs if they represent one event.

An edition's label adds its year when names repeat, or its first date when editions share a year. Filters, counts, event activities and attendee exports use these labels. The CRM CSV lists attendance dates and names and includes any supplied event ID. The original four conferences keep their existing labels and output.

## Repeated rows and retries

| Input | Result |
|---|---|
| Same person, same edition | One attendance, retaining distinct notes and source IDs. Combined source rows receive a data-quality flag. |
| Exact retry: the same person, edition and date, with no new email, LinkedIn URL, source ID, name or note | Skip the row, whether it repeats the existing pool or an earlier row in this import. |
| Another date in that edition, or a row adding an identifier, a different name or a note | Keep the row and combine it into the person's attendance. It goes through the same build checks as any row: a different name is flagged as an identity conflict, and a new note is kept. Later batches can add people and event days. |
| Same file again | Nothing added. Both views explain this; the integration demo offers no Import button. |
| Another edition of a known conference | Accept it as a separate event. |

Skipping only exact retries never changes the editions or who is who, so the import preview, the pool after import and a CLI run on the same rows agree (`planAttendeeImport` in `pipeline/dataset.ts`).

Browser imports last only until reload. Saved outreach history has its [own lifetime](identity-and-history.md#how-long-an-imported-person-lasts).

## Tests

`tests/import-export/csv-strict.test.ts` covers valid and broken files across the parser, importers and CLI. `event-editions.test.ts` covers editions, labels, retries and undated rows. Browser coverage is in `tests/browser/import-editions.spec.ts` and `integration-demo-import.spec.ts`, including failed imports leaving the pool unchanged.
