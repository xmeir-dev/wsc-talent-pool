# Assumptions

The [written assignment](../assignment/index.html) defines the scope; the [discovery call](discovery-call-context.md) supplies context. Build against synthetic CSVs, with HubSpot-ready output. The brief makes a recruiter view optional; one is included. Live connections and outreach are outside this exercise.

## Where recruiters work

**Use the tools recruiters already work in.** Prefer showing recommendations and next actions inside HubSpot and Comeet, using their existing lists, records and supported extensions. The standalone recruiter view is the take-home deliverable and a working place to go through the pool (Shir noted on the call that a separate tool is fine while Comeet can't be extended); its results are designed to flow into HubSpot and Comeet, and the [integration demo](../integration-demo/README.md) shows that production experience inside both tools.

**Plans are assumed.** WSC left the plans to this design (Shir, 2026-10-19), so the production design assumes Comeet Enterprise (API and custom fields) and, for the interactive contact card, HubSpot Enterprise. If WSC is on lower plans, the fallback keeps results on HubSpot properties and lists. See [platform requirements](design.md#production-version).

## Selection rules

- **A focused shortlist.** Promising candidates with insufficient evidence go into `needs_review`. Missing information is not proof of missing ability.
- **Expertise first.** Assess skills, responsibilities, and relevant seniority. Conference relevance and job fit are separate; attendance and job titles alone do not establish either.
- **Allow supporting gaps.** For JOB001, senior ML and computer-vision evidence matter; missing AWS evidence alone does not exclude someone. Keep every unconfirmed requirement visible, including Object Detection.
- **Industry only breaks ties for JOB001.** Sports/media experience can lift someone above an equal candidate, but is not required. Other roles retain their own requirements, such as JOB003's Sports Analytics skill.
- **Connections only break close ties.** On the call Shir asked that a connection give "bonus points, just like in Comeet" for referrals. Here it is deliberately a tie-breaker and a reference lead, not points: a connection is not evidence of skill, and a referral in Comeet is a colleague vouching, while a LinkedIn connection or shared employer is not. So a connection never lifts a clearly weaker candidate above a stronger one; it shows on every row and profile, and **Ask** turns it into a real reference request. More connections do not automatically mean more value.
- **Clear mismatches are kept, not dropped.** People with no evidence of a role's core discipline are marked `not_recommended_for_role` for that role and remain available for others.

## Data and operating limits

All 75 supplied attendees match a profile: **42 list WSC employee connections and 33 list none**. Unconnected contacts include broadcast specialists, so assess industry and job fit independently of connections. The real files contain no missing profiles, duplicates, repeat attendees, conflicts or unknown employee IDs, so that handling is proven with synthetic test fixtures: unmatched attendees are retained for review, and conflicting identities are flagged instead of guessed.

Profile freshness, application history, previous rejection, job interest, and permission to contact are unknown. Total experience is not specialty experience; employment-history lists cannot safely be paired by position.

Roles have no location in the data, so location does not affect the score; recruiters can filter by where attendees are based. The Location filter lists countries with a WSC office first (`data/wsc_offices.json`, from WSC's own site, checked 2026-10-19; Spain appears only on the careers page, so it may be remote hires rather than an office). See [Made up for the recruiter view](#made-up-for-the-recruiter-view) for everything the view shows that the files don't contain.

## Made up for the recruiter view

None of this feeds the ranking. Each item is made up because the supplied files don't contain it, and each says what production uses instead.

**Content**

- **AI summaries.** Attendees with no recruiter note get a one-line summary written by an AI model from their LinkedIn fields (`data/ai_summaries.json`), labelled "AI summary" on screen.
- **Recruiters and avatars.** The files don't say who wrote a conference note, so each conference has an invented recruiter (`data/demo_recruiters.json`). Employee and recruiter avatars are generated illustrations.
- **Comeet history.** Four people have made-up Comeet records (`data/demo_comeet.json`): Alex Turner (rejected for Senior PM), Ryan Patel (in process for Data Engineer), James Thornton (rejected for an older role) and Scarlett Green (an uncontacted lead). The integration demo seeds its simulated Comeet from the same file and applies the same contact rules. Production reads them from the Comeet Recruiting API, matched by email.
- **Sample meetup.** `data/samples/wsc_product_meetup.csv` is a made-up WSC product meetup: three returning attendees and five new people, whose LinkedIn profiles come in `wsc_product_meetup_profiles.csv` (standing in for the profile lookup production runs). Adding it fills the empty Senior PM shortlist with Lior Ben-David and Maya Levin, which is Shir's "product meetup, then a product role opens" story from the call.

**Links and addresses**

- **Employee emails** use an assumed `first.last@wsc-sports.com` pattern; the data has none.
- **Comeet and HubSpot links** (the Comeet icon on each job, the Contact card) use assumed addresses: the snapshot has no Comeet position IDs, and its `HS…` IDs are source IDs, not HubSpot record IDs. **Look up** searches Comeet by email.

**Actions (simulated: nothing is sent or connected)**

- **Ask a WSC connection.** **Send in Slack** records the request as sent (WSC uses Slack, confirmed 2026-10-19; production sends it as a direct message from a Slack app). **Copy** and **Email** only prepare it, because neither proves anything was sent.
- **Invite to job** drafts an invite from the recruiter who met the person; **Send invite** records it. In production the person is added to that position in Comeet, and it counts as sent only once a message is confirmed.
- **Bulk actions.** Ticking rows shows a bar above and below the table: **Ask WSC connections** sends one request per colleague, and **Invite to jobs** sends each person to their own best-fit job, skipping and listing anyone the rules block.
- **Outreach history** ([contact tracking plan](contact-tracking-plan.md)) is kept in this browser only, in a store that is safe with several tabs open and tied to each person's durable ID ([identity and history](identity-and-history.md)). Each role's status shows inside its job chip in the table, the profile has an **Activity** card, and the same rules block unwanted or repeated contact everywhere. Seeded examples: Noah Anderson declined Backend Engineer (still invitable for Data Engineer, with a warning), Ryan Patel is in process in Comeet (blocked), a reference request about Alex Turner was copied but never sent (**Mark sent** confirms it), and Scarlett Green is an uncontacted lead (not blocked).

**Sources**

- **Add conference** adds one event's attendee list to the pool in the browser, from a file, a link to a Google Form's responses sheet (it must be viewable by anyone with the link; the form itself can't be read without signing in), or the sample. It lasts until the page reloads. In production, forms in the shared "Event sign-ups" folder send sign-ups to HubSpot directly ([which forms sync](#how-conference-lists-arrive)).
- **Connect accounts** in the header opens **Your accounts**: HubSpot, Comeet, Google Forms and Slack, each **Not connected** at first, with real setup steps and links (checked against each tool's docs on 2026-10-19) and the fields each needs. Nothing typed there is stored or sent; **Connect** and **Sync now** only show what would happen. In production, new jobs and sign-ups arrive on their own once connected, with a nightly check, and **Sync now** forces one.

## How conference lists arrive

**The organizer's attendee list is the best source:** it covers everyone registered, not only people who stopped by. It matches the supplied `conference_attendees.csv`.

**For conferences WSC hosts, WSC is the organizer.** Today each recruiter builds a sign-up form per event and it fills a separate spreadsheet (from the 2026-10-15 call), so lists are scattered and rarely revisited. The fix is one shared sign-up form connected to HubSpot, reused for every event with the event name as a field. Each sign-up becomes a HubSpot contact tagged with the event and is assessed automatically, with no spreadsheet. WSC uses Google Forms (confirmed by Shir, 2026-10-19), so the shared form stays a Google Form. Google Forms has no built-in HubSpot connection, so the integration service passes each response to HubSpot as it arrives. Past spreadsheets are imported once.

**Which Google Forms sync.** Not every form at WSC belongs in the pool, so the rule is a shared Google Drive folder, "Event sign-ups". Forms live in Drive like any document; every form in that folder syncs, new ones are picked up on their own, and HR surveys or team polls elsewhere are ignored. With one shared form there is only one form in the folder; if recruiters keep a form per event, they save each one there. Connecting needs a one-time Google sign-in by an admin that allows reading that folder and its form responses. The **Add conference** panel points to this with a quiet "How to connect this automatically" line; adding a file or sheet link by hand stays as the fallback.

**For outside conferences,** organizers often share only attendees who opted in, sometimes only with sponsors, and sometimes without email or LinkedIn URL; thinner rows land in `needs_review`. Whether attendees agreed to be contacted about jobs is confirmed before a list is sent in. Options for getting these lists into HubSpot without a manual upload, all run by the same integration service:

1. **A dedicated email address (preferred),** for example `talent-lists@wsc-sports.com`. The organizer or anyone at WSC forwards the spreadsheet; the service imports it, runs the matching and replies with a summary ("Imported 120 people from Sports Video AI Meetup").
2. **A shared folder** (Google Drive or SharePoint, "Conference lists"). A new file starts the same import. Outside organizers usually cannot write to it, so someone at WSC copies the file in.
3. **The event platform's own HubSpot integration,** where the organizer uses one and agrees to share, usually for sponsors. Attendees arrive with no file.

**Fallbacks:** HubSpot's Import button for one-off files, and WSC's sign-up form at the booth for events that will not share a list. A file missing required columns, or with broken CSV structure, imports nothing and the sender is told what is wrong and where, as the demo's import does ([importing and events](importing-and-events.md)).

## People already in Comeet

Comeet status is unknown in this exercise: the `comeet_status` column is reserved and always reads `unknown`. In production it is read, not guessed: Comeet's Recruiting API returns each candidate's `status`, `current_steps`, `position_uid` and `time_last_status_changed`. Comeet sends webhooks for positions and hires but not for status changes, so the integration polls it (for example every 15 minutes, plus the nightly check). The profile's Comeet row shows how it would look, using made-up records for four people (`data/demo_comeet.json`). In production, before anyone is contacted:

- **Match on email** against Comeet candidates and employees.
- **In an active process** for any role: link the HubSpot contact to the Comeet candidate and do not contact them again from the talent pool; the owning recruiter decides.
- **Rejected within the last 6 months**: move to `needs_review` with the rejection reason and date shown, so a recruiter decides whether this role is different enough to reach out.
- **Hired or a current employee**: exclude from the talent pool.

The 6-month window is an assumption to agree with the recruiting team.

## Privacy

These are the privacy rules the [design document](design.md#at-scale) relies on:

- **Lawful basis and notice at capture.** The registration form (WSC's own, or the outside organizer's) says what is shared and why, and records consent or the legitimate-interest basis.
- **Consented or licensed sources only.** Data from the attendee list or given by the candidate, a licensed enrichment vendor whose terms permit recruiting use, or a recruiter reading a profile by hand. No LinkedIn scraping.
- **Retention.** Contacts not engaged within 12 months are deleted or asked to re-confirm (the period is an assumption to confirm with legal); access, correction and deletion requests are honoured across HubSpot, the assessment store and Comeet.
- **Restricted, logged access.** Only the recruiting team sees candidate data, and views and exports are logged.

**Refresh cadence:** reassess relevant open roles when new contacts arrive and when a role opens or its requirements change. **Trigger:** in this take-home a recruiter starts each run on the supplied snapshot. In production the triggers are automatic (a new HubSpot contact, a Comeet position change), as described in the [design document](design.md#production-version); the [integration demo](../integration-demo/README.md) simulates them.

## How candidates are ranked

The full rules are in [How candidates are ranked](scoring.md): each role's must-haves and core discipline, skill equivalents, the 60% required-skills bar, minimum years by seniority, and the tie rule. **The bar, the minimum years, the must-haves and the equivalents are stated assumptions for this exercise, not validated hiring standards.** They should be confirmed with hiring managers and tested against past hiring decisions.

Further assumptions behind them:

- Skills listed on the profile are the evidence; a skill not listed is unconfirmed, not absent.
- Total years come from the profile and include internships; they are shown, not corrected, and anyone with intern or junior roles is flagged "confirm non-intern years".
- Possible references are matched from employer names and years only, so they are leads to check.
- Conference relevance uses skills and industry, not job titles.
