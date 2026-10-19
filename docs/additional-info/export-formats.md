# Export formats

**Use Excel to read results; use CSV to import them into HubSpot.** The Excel download keeps text as text. The CSV preserves exact assessment values and is unsafe to open as a spreadsheet.

| Download | Contents |
|---|---|
| **Attendees shown, Excel** | People in the table's current order, with every filter applied. |
| **Full JOB… assessment, Excel** | Every person, column and decision for the selected job, in the same order as its CSV. |
| **CRM import CSV, full JOB… assessment** | Full selected-job assessment, byte-for-byte identical to the CLI output. Use the [HubSpot mapping](../schema-and-flow.md#hubspot-preparation). |

The last two choices appear when one job is selected. Without one selected job, Download saves the attendees shown as Excel.

## Why two formats

Spreadsheet programs can read a CSV value such as `=1+2` as a formula and show `3`. CSV quoting does not prevent this. Adding an apostrophe would change the value imported into HubSpot.

The **CSV therefore remains unsanitized**, using the assessment's normalized values, including trimmed surrounding whitespace. It adds only required CSV quoting. It is an interchange file, not the reading copy.

The **Excel workbook assigns cell types**: text stays literal, including `=1+2` and `007`; counts, ranks and years are numbers. No formula cells are written. XML control characters are escaped using the workbook format.

Excel cells are limited to 32,767 characters. Longer text is cut with a visible marker stating its original length and pointing to the CSV for the full value. The CSV is not truncated. Event names in attendee exports distinguish [conference editions](importing-and-events.md#event-editions).

## Supported reader and what was tested

**Verified reader: LibreOffice Calc 26.8.1.1 on macOS.** The test opens, saves and reopens workbooks made by the actual export code, checking:

- Formula-like names and companies, including leading spaces and control characters, remain literal text with no formula cells.
- Counts and ranks remain numeric and unchanged.
- Oversized text has the visible truncation marker.

A control test opens the CRM CSV and confirms that `=1+2` becomes a formula. It demonstrates why the formats must stay separate.

One reader difference: LibreOffice converts a CR LF pair within a cell to a single line feed. It remains text. Other tested values return unchanged.

Run `npm run verify:xlsx` for this check (`tests/import-export/xlsx-libreoffice.test.ts`). It fails if LibreOffice is unavailable; ordinary `npm test` skips that check instead. Set `SOFFICE=/path/to/soffice` if needed.

## What this does not claim

Microsoft Excel, Google Sheets and Numbers have not been tested. Verification covers the generated `.xlsx` files in LibreOffice, not every spreadsheet program or later manual edits. The CRM CSV remains unsafe for spreadsheet viewing by design.
