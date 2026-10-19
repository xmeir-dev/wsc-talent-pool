# Assumptions

**This is a working assessment tool using synthetic files. Connections, sends and recruiting history shown in the demos are simulated.** The [assignment](../assignment/index.html) defines the scope; the [discovery call](additional-info/discovery-call-context.md) provides context.

## Where recruiters work

The standalone view is the deliverable; Shir accepted a separate tool while Comeet cannot be extended. Production should place results and actions in HubSpot and Comeet. [Proposed design](design.md#production-version).

Plans are assumed, not verified: Comeet Enterprise for API access and custom fields; HubSpot Enterprise for the proposed app card. Shir left plan selection to the design on 2026-10-19. Lower-plan options need validation.

## Selection rules

- **Skills first.** Listed skills and total years drive fit. Titles and attendance do not establish qualification; event relevance is separate from job fit.
- **Keep gaps visible.** Missing AWS alone does not exclude someone from JOB001. Other requirements, including Object Detection, remain visible for confirmation.
- **Connections break ties.** Shir requested “bonus points, just like in Comeet.” This design uses connections only after qualification evidence ties. More connections add no advantage; a connection is not an endorsement.
- **Industry has a limited role.** Sports/media evidence breaks qualification ties for JOB001. Other roles retain their own requirements, including Sports Analytics for JOB003.
- **Keep everyone in the pool.** Missing or conflicting profiles go to review. A profile without a listed core-discipline match can be marked not recommended for that role, even when useful adjacent experience exists. See [known classification gaps](scoring.md#limits).

## Data and operating limits

All 75 supplied attendees match profiles: 42 list WSC connections and 33 do not. Missing profiles, repeat attendees, duplicates, conflicting identities and unknown employee IDs are covered by synthetic fixtures, not examples in the supplied files.

Profile freshness, actual application history, previous rejection, job interest and permission to contact are unknown. Total years include internships and are not specialty experience. Separate employment-history lists cannot safely be paired by position.

Roles have no location, so location does not affect scores. Recruiters can filter attendees by country. Office-country ordering uses WSC’s website, checked 2026-10-19; Spain appears only on the careers page and may represent remote hiring.

## Made up for the recruiter view

Demo notes, history and actions do not change the supplied-data ranking. Importing sample attendees adds new evidence and changes results.

| Demo addition | What it means |
|---|---|
| AI summaries, recruiters, avatars | Summaries use supplied profile fields and are labelled. Recruiter names are invented; avatars are generated illustrations. Files: `data/demo/ai_summaries.json`, `recruiters.json`. |
| Comeet history | `data/demo/comeet.json`: Alex Turner and James Thornton have past rejections; Ryan Patel is in process; Scarlett Green is an uncontacted lead. Both views use these examples. |
| Sample meetup | Three returning and five new attendees, with mock profiles. Importing it adds Lior Ben-David and Maya Levin to the Senior PM shortlist. Files: `data/demo/samples/`. |
| Links and email addresses | Employee emails assume `first.last@wsc-sports.com`. Comeet and HubSpot addresses are placeholders; supplied `HS…` IDs are not live HubSpot record IDs. **Look up** searches Comeet by email. |

**Actions:** Send invite and Send in Slack record simulated sends. Copy and Email prepare requests only; Mark sent records confirmation. Bulk invites choose each person’s best-fit role; reference requests group people by colleague. WSC’s Slack use was confirmed on 2026-10-19.

Browser history is shared across tabs and retained per person and role. Seeded cases include Noah declining Backend Engineer but remaining eligible for Data Engineer; Ryan’s active process blocking contact; Alex’s copied, unsent reference request; and Scarlett’s uncontacted lead status. [Contact rules](additional-info/contact-tracking-plan.md) · [Identity and saved history](additional-info/identity-and-history.md).

**Imports:** Add conference accepts a file, sample or publicly readable Google Form responses sheet. It cannot read a private form. Imported attendees disappear on reload.

**Connections:** Your accounts shows setup instructions checked on 2026-10-19. Entered keys are neither stored nor sent. Connect and Sync now only demonstrate the proposed steps.

## How conference lists arrive

**Proposed capture:** use the organizer’s permitted attendee list, rather than only booth contacts. The discovery call described scattered event spreadsheets; Shir confirmed Google Forms on 2026-10-19.

For WSC events, reuse one form with an event field. An integration service reads forms and responses from an approved “Event sign-ups” Drive folder, including newly added forms; unrelated forms stay out. This requires Google authorization, not a built-in Forms-to-HubSpot connection. Import historical sheets once.

For external events, confirm recruiting use is permitted; lists may cover only consenting attendees or lack identifying fields. Preferred arrival is a dedicated recruiting-list inbox; shared folders and organizer-supported event-platform connections are alternatives. Manual HubSpot import and a booth sign-up form remain fallbacks. Broken CSVs or missing columns import nothing and report the problem. [Import rules](additional-info/importing-and-events.md).

## People already in Comeet

The output’s `comeet_status` remains `unknown`; on-screen history is fictional. Production would poll Comeet status, process step, position and last-change date because no candidate-status webhook is documented.

Before contact, the proposed rules are:

- Match email against candidates and employees; resolve ambiguity first.
- Block talent-pool contact during any active process; defer to its recruiter.
- Send rejections within 6 months to review, showing the reason and date.
- Exclude hired people and current employees.

The rejection window requires recruiting-team agreement. A production invite counts as sent only after message confirmation.

## Privacy

Production assumptions, requiring WSC’s review:

- Explain recruiting use at capture and record consent or another lawful basis.
- Use permitted attendee data, licensed sources or manual review; no LinkedIn scraping.
- Delete or reconfirm unengaged contacts after 12 months, subject to legal approval. Honor access, correction and deletion across HubSpot, Comeet and the assessment store.
- Restrict access to recruiting and log views and exports.

The take-home runs manually. Production would reassess changed contacts, profiles and roles, with a nightly check and manual refresh. [Triggers](design.md#production-version).

## How candidates are ranked

The 60% skills threshold, minimum years, must-haves and skill equivalents are exercise assumptions, not validated hiring standards. Confirm them with hiring managers and past decisions. [Rules and limits](scoring.md).

A missing skill is unconfirmed, not proven absent. Total years are retained, with intern/junior history flagged for checking. Shared employers and overlapping dates suggest possible references, not proof that people worked together.
