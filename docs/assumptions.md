# Assumptions

The [written assignment](../assignment/index.html) defines the scope; the [discovery call](discovery-call-context.md) supplies context. Build against synthetic CSVs, with HubSpot-ready output. The brief makes a recruiter view optional; one is included. Live connections and outreach are outside this exercise.

## Where recruiters work

**Use the tools recruiters already work in.** Prefer showing recommendations and next actions inside HubSpot and Comeet, using their existing lists, records and supported extensions. Add a separate dashboard only when an essential recruiting task cannot be handled well there. The current standalone view demonstrates the assignment; the [integration demo plan](native-integration-demo-plan.md) shows the intended production experience.

## Selection rules

- **A focused shortlist.** Promising candidates with insufficient evidence go into `needs_review`. Missing information is not proof of missing ability.
- **Expertise first.** Assess skills, responsibilities, and relevant seniority. Conference relevance and job fit are separate; attendance and job titles alone do not establish either.
- **Allow supporting gaps.** For JOB001, senior ML and computer-vision evidence matter; missing AWS evidence alone does not exclude someone. Keep every unconfirmed requirement visible, including Object Detection.
- **Industry is a bonus for JOB001.** Sports/media experience can help, but is not required. Other roles retain their own requirements, such as JOB003's Sports Analytics skill.
- **Connections only break close ties.** They cannot lift a clearly weaker candidate above a stronger one. A connection or shared employer suggests a possible reference, not an endorsement. More connections do not automatically mean more value.
- **Clear mismatches are kept, not dropped.** People with no evidence of a role's core discipline are marked `not_recommended_for_role` for that role and remain available for others.

## Data and operating limits

All 75 supplied attendees match a profile: **42 list WSC employee connections and 33 list none**. Unconnected contacts include broadcast specialists, so assess industry and job fit independently of connections. The real files contain no missing profiles, duplicates, repeat attendees, conflicts or unknown employee IDs, so that handling is proven with synthetic test fixtures: unmatched attendees are retained for review, and conflicting identities are flagged instead of guessed.

Profile freshness, application history, previous rejection, job interest, and permission to contact are unknown. Total experience is not specialty experience; employment-history lists cannot safely be paired by position.

## People already in Comeet

Comeet status is unknown in this exercise: the `comeet_status` column is reserved and always reads `unknown`. In production, before anyone is contacted:

- **Match on email** against Comeet candidates and employees.
- **In an active process** for any role: link the HubSpot contact to the Comeet candidate and do not contact them again from the talent pool; the owning recruiter decides.
- **Rejected within the last 6 months**: move to `needs_review` with the rejection reason and date shown, so a recruiter decides whether this role is different enough to reach out.
- **Hired or a current employee**: exclude from the talent pool.

The 6-month window is an assumption to agree with the recruiting team.

## Privacy

Consistent with the [design document](design.md#privacy-and-gdpr):

- **Lawful basis and notice at capture.** The event form says what is stored and why, and records consent or the legitimate-interest basis.
- **Consented or licensed sources only.** Data the candidate gives at capture, a licensed enrichment vendor whose terms permit recruiting use, or a recruiter reading a profile by hand. No LinkedIn scraping.
- **Retention.** Contacts not engaged within 12 months are deleted or asked to re-confirm (the period is an assumption to confirm with legal); deletion on request is honoured across HubSpot, the assessment store and Comeet.
- **Restricted, logged access.** Only the recruiting team sees candidate data, and views and exports are logged.

**Refresh cadence:** reassess relevant open roles after each conference import and when a role opens or its requirements change. **Trigger:** assume the responsible recruiter manually starts each selected-job run. The take-home uses the supplied snapshot; scheduled background refresh and automatic triggers are outside this version.

## How candidates are ranked

The full rules are in [How candidates are ranked](scoring.md): each role's must-haves and core discipline, skill equivalents, the 60% points bar, minimum years by seniority, and the tie rule. **The bar, the minimum years, the must-haves and the equivalents are stated assumptions for this exercise, not validated hiring standards.** They should be confirmed with hiring managers and tested against past hiring decisions.

Further assumptions behind them:

- Skills listed on the profile are the evidence; a skill not listed is unconfirmed, not absent.
- Total years come from the profile and include internships; they are shown, not corrected, and anyone with intern or junior roles is flagged "confirm non-intern years".
- Possible references are matched from employer names and years only, so they are leads to check.
- Conference relevance uses skills and industry, not job titles.
