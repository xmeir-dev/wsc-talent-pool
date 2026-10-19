# Export formats

There are two kinds of download, for two different jobs. They are labelled separately and never share a format.

| Purpose | Where | Format | Values |
|---|---|---|---|
| **For people to open** (the default) | Recruiter view: **Download** → **Attendees shown (N), Excel**; with one job chosen also **Full JOB… assessment (N), Excel** | Excel workbook, `.xlsx`, MIME `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`. Files `attendees_<filters>.xlsx` and `candidates_<job_id>.xlsx` | Every text value is a text cell; counts, ranks and years are number cells. Text is exactly as in the pool, with nothing added |
| **CRM import / data interchange** | Recruiter view, with one job chosen: **CRM import CSV, full JOB… assessment**. CLI: `npm run pipeline` | UTF-8 CSV, `candidates_<job_id>.csv`, `text/csv` | The same normalized values as the assessment (surrounding whitespace trimmed on import), not sanitized for formulas. Byte for byte the same file as the CLI writes (a test checks this). Not meant to be opened in a spreadsheet program |

## Why two formats

A spreadsheet program guesses each CSV cell's type when it opens the file. A cell that starts with `=`, `+`, `-` or `@` can be turned into a formula, so an attendee called `=1+2` shows as `3`. Putting the cell in CSV quotes does not prevent this: quotes only protect commas and line breaks. Changing the value instead (adding an apostrophe or a space in front) would corrupt the CRM import and break the match with the CLI file. So:

- The **CSV is not sanitized**. `pipeline/csv.ts` writes the assessment's values unchanged (the normalized values: both importers trim surrounding whitespace), only quoting where CSV punctuation requires it. The shared serializer never adds prefixes. Import this file into HubSpot with the [mapping in Schema and flow](../schema-and-flow.md#hubspot-preparation); do not open it in a spreadsheet program to read it.
- The **Excel file says what each cell is** (`pipeline/xlsx.ts`, a small writer in this repo with no added dependency):
  - Text is written as an inline string cell (`t="inlineStr"`) with the Text number format (`@`). It is never a formula element and never left for the program to type, and it is not changed. A value that looks like a number in a text column (such as `007`) stays text.
  - Counts, ranks and years (`shortlist_rank`, the skill counts, `years_experience`, `connection_count`) are number cells, so they sort and add up. The column decides the type, never the look of a value.
  - Characters XML cannot hold (control characters) use the format's own `_xHHHH_` escape. Tab, line feed and carriage return are written as character references, so a reader keeps them.
  - A cell holds at most 32,767 characters, the format's limit; LibreOffice silently cuts anything longer when it opens a file. Longer text is therefore cut by the writer, visibly. It is cut to fit the limit and ends with "… [truncated: N characters in total; the CRM import CSV has the full text]". Only the Excel download does this; the CRM CSV keeps every character. The LibreOffice test checks that a 40,001-character value opens as exactly this marked text.

The Excel assessment has the same columns, people, order and decisions as the CSV for that job. The attendee download has the same people, order and filters as the table on screen. `conference_name` there holds each event edition's label, so two runs of one conference read apart ([importing and events](importing-and-events.md#event-editions)).

## Supported reader and what was tested

**Supported reader: LibreOffice Calc 26.8.1.1** (`soffice --version`: `LibreOffice 26.8.1.1 bf6ef2662401c7d6dce671ab4deb26ee0af3a7c1`), on macOS, run headless. **Tested format: the `.xlsx` files above**, made by the app's own export code.

`tests/import-export/xlsx-libreoffice.test.ts` (also `npm run verify:xlsx`):

1. imports attendees whose name and company are `=1+2`, `+1+2`, `-1+2`, `@SUM(1,2)` and `\u0001=1+2` through the recruiter view's import, then makes the attendee and assessment Excel files with the real export functions;
2. makes a second file whose name and company start with a space, tab, carriage return, line feed, vertical tab, U+0001 or a no-break space before `=1+2`;
3. opens each file in LibreOffice and saves it as `.xlsx` (open and save), then reopens the saved file and converts it to UTF-8 CSV;
4. checks the saved file contains no formula (`<f>`) anywhere, every one of those values is a string cell with exactly the original text, the reopened CSV shows the same literal text, and every count and rank is still a number cell with the same value.

A control in the same test opens the CRM CSV directly in LibreOffice: there `=1+2` does become a formula showing 3. This shows both why the CRM file is not the person download and that the check can detect a formula.

One known reader behaviour: a CR LF pair inside a cell comes back from LibreOffice as a single line feed (its line-break convention). That value is still text, not a formula, and the test records this. Every other tested value comes back byte for byte.

Without LibreOffice installed the test is skipped with a message, so `npm test` passes on a fresh checkout. `npm run verify:xlsx` fails instead of skipping. Set `SOFFICE=/path/to/soffice` if it is not on the usual paths.

## What this does not claim

The check was run with LibreOffice only. Microsoft Excel, Google Sheets and Numbers were not tested. They read the same standard cell types and are expected to behave the same, but that has not been verified here. This is not a claim that the file is safe in every spreadsheet program, and it does not cover what a person types into a cell after opening it. The CSV meant for CRM import is not made safe to open in a spreadsheet: it is exact on purpose.
