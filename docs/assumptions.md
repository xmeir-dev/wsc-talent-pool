# Assumptions

The [written assignment](../assignment/index.html) defines the scope; the [prep call](mock-call-summary.md) supplies context. Build against synthetic CSVs, with HubSpot-ready output. The assignment makes a recruiter screen optional; this build includes the requested webapp. Live connections and outreach are outside this exercise.

## Selection rules

- **A focused shortlist.** Promising candidates with insufficient evidence go into `needs_review`. Missing information is not proof of missing ability.
- **Expertise first.** Assess skills, responsibilities, and relevant seniority. Conference relevance and job fit are separate; attendance and job titles alone do not establish either.
- **Allow supporting gaps.** For JOB001, senior ML and computer-vision evidence matter; missing AWS evidence alone does not exclude someone. Keep every unconfirmed requirement visible, including Object Detection.
- **Industry is a bonus for JOB001.** Sports/media experience can help, but is not required. Other roles retain their own requirements, such as JOB003's Sports Analytics skill.
- **Connections only break close ties.** They cannot lift a clearly weaker candidate above a stronger one. A connection or shared employer suggests a possible reference, not an endorsement. More connections do not automatically mean more value.

## Data and operating limits

All 75 supplied attendees match a profile: **42 list WSC employee connections and 33 list none**. Unconnected contacts include broadcast specialists, so assess industry and job fit independently of connections. Missing-profile handling still needs testing: retain unmatched attendees for review, and flag conflicting identities instead of guessing.

Profile freshness, application history, previous rejection, job interest, and permission to contact are unknown. Total experience is not specialty experience; employment-history lists cannot safely be paired by position. A production version must establish data permissions, retention, access controls, and an appropriate outreach process.

**Refresh cadence:** reassess relevant open roles after each conference import and when a role opens or its requirements change. **Trigger:** assume the responsible recruiter manually starts each selected-job run. The take-home uses the supplied snapshot; scheduled background refresh and automatic triggers are outside this version.

## Still to decide

Define each role's essential versus supporting requirements, any score weights and shortlist thresholds, what counts as a close tie, and whether connection count matters within it. Keeping clear mismatches under `not_recommended_for_role` is a proposal; they would remain available for other roles.
