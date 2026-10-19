# How candidates are ranked

**Choose a role. The tool compares each person's listed skills and experience with that role's rules, then explains the result.** WSC connections help break ties and identify possible references. They do not establish job fit.

These are transparent starting rules, not validated hiring standards. Review the [limits](#limits) before using the results to make recruiting decisions. Rule version: `rules-v4`.

## The three outcomes

| Result | Meaning | Recruiter action |
|---|---|---|
| **Shortlist** | Passes the configured skill and experience checks | Verify suitability and interest |
| **Needs review** | Evidence is incomplete, uncertain or below a threshold | Check the stated gap |
| **Not recommended for this role** | No skill matches the rule's recognized core discipline | Remains in the pool; check for missed evidence before dismissing |

A missing or conflicting profile, or an empty skill list, sends a person to **Needs review**. A sparse profile can still miss the core-discipline check; the Tobias example below shows why the distinction matters.

## The shortlist checks

A person must pass all three:

1. Meet the role's **must-haves** below.
2. Have at least **60% of required skills confirmed on the profile**, rounded up: 3 of 4, 3 of 5, or 4 of 6.
3. Meet the **minimum total experience**: Senior 5 years, Mid-Senior 4, Mid 3, Junior 0.

Unknown years cannot pass. An unsupported seniority, such as “Staff” or a blank, leaves otherwise qualifying people in review until the role is clarified; the demo's New position form offers only the four levels. Supporting skills cannot compensate for a missing must-have.

| Role | Must-haves |
|---|---|
| JOB001 Senior ML Engineer | Computer Vision plus PyTorch or related deep learning. Related evidence can satisfy these must-haves, but never the 60% confirmed-skills threshold. |
| JOB002 Backend Engineer | Python or Go, confirmed |
| JOB003 Senior Product Manager, Sports Data | Product Management and Sports Analytics, both confirmed. Sports broadcasting or data-product experience is only a related skill: it can earn review, never the shortlist. |
| JOB004 Data Engineer | Python, confirmed |

**Example:** Priya Anand is first for JOB001. Deep Learning satisfies the PyTorch must-have, while four other required skills are confirmed. Missing AWS alone does not block an ML shortlist; it remains a visible gap.

**Reasons say what was found or missing.** A shortlist reason reads like "Must-haves met · 4/5 listed skills · 7 years reported", adding "; experience needs confirmation" when intern or junior roles are included; the full evidence stays in `fit_evidence`, `skill_gaps` and `seniority_evidence` (the HubSpot card's Matched evidence and Not confirmed). A needs-review reason names the missing skills, for example Bruno Ferreira for JOB001: "2 of 5 required skills on the profile (needs 3); 1 more likely (Machine Learning for PyTorch), please confirm; missing Object Detection, AWS". A missing must-have reads "Missing must-have: Sports Analytics", or "(only a related skill, Sports Broadcasting, which is not enough)" when one is close.

A must-have the role does not also list as required (a new role's must-have AWS with required Kubernetes, Terraform, CI/CD) is still checked on the profile and shown as evidence: `fit_evidence` starts "Must-have: AWS", the card lists it under Matched evidence and the handoff tags it. It never counts toward the required-skills threshold.

**New roles get their criteria when they are created.** The demo's New position dialog suggests core skills, must-haves, required skills and nice-to-haves from the job description (scripted in the demo). The recruiter edits and confirms them, and publishing stores them with the role (`core_skills` and `must_have_skills` in `job_openings.csv`, [schema](schema-and-flow.md#role-criteria-columns)). A role is scored by its written policy above if it has one, else by those confirmed criteria: any one core skill on the profile (by name or accepted alias) makes the person relevant, and each must-have must be on the profile by name or alias. Such a role is not provisional.

- The dialog's prefilled Computer Vision Engineer (Mid), confirmed as suggested (core Computer Vision or Object Detection; must-haves Python and Computer Vision; required Python, Computer Vision, Object Detection, OpenCV): 1 shortlisted, 9 in review (each short of 3 of 4 required skills), 65 not recommended. With no criteria, the same role put 42 in review, because any Python on the profile made someone "relevant".
- An unrelated role, the Site Reliability Engineer description in `tests/role-examples.ts`, confirmed as suggested (core Kubernetes, Terraform, CI/CD, Monitoring; must-have AWS): 9 shortlisted, 4 in review, 62 not recommended.

**The provisional default remains only for a role without criteria.** A `job_openings.csv` row with neither column filled has no must-haves, treats any required skill on the profile as its core discipline, and is flagged "provisional default rules applied (no must-haves)". A role with must-haves but no core skills keeps its must-haves and falls back to the required skills for the core, flagged "no core skills … provisional default applied"; the dialog warns about this before publishing. The HubSpot card shows either flag with the person's other data warnings. A hiring manager should confirm such a role's criteria before relying on it.

## How skills are counted

| Evidence | Treatment |
|---|---|
| Exact skill or accepted alias | Counts toward the required-skills threshold |
| Related skill or inferred experience | Shown for confirmation; does not count toward that threshold |
| Skill absent from the profile | Unconfirmed, not proof the person lacks it |

Matching ignores case and extra spaces, but uses whole skill names. “PyTorch Lightning” does not equal “PyTorch”. Repeated requirements count once. Nice-to-haves affect ordering only; exact, alias and related matches count, while inferred matches do not.

One profile skill can support several requirements: Sports CV confirms Computer Vision and suggests Object Detection. The [reference table](#accepted-equivalents) lists every mapping.

## Seniority and titles

The experience check uses the profile's **total years**, including internships and junior roles. It does not measure years in the specialty. When a past title contains “intern”, “internship”, “research assistant” or “junior”, the seniority evidence and next step say “confirm non-intern years”. Subtracting internships would move James Thornton and Nathan Brooks from the JOB001 shortlist into review.

Titles do not improve a person's score. Leadership-style titles, including Lead, Principal and Architect, trigger a “confirm hands-on” note. This is a prompt to investigate, not a finding about their work.

## Ties and connections

Within each outcome, order by:

1. Confirmed required skills.
2. Related or inferred required skills.
3. Confirmed or related nice-to-haves.
4. Sports/media industry relevance, for JOB001 only.
5. At least one resolved WSC connection, only when all preceding measures tie.

Three connections give no advantage over one. Shortlisted people still tied share a rank and appear alphabetically; the alphabetical order is not a preference. Other groups use the same ordering without ranks.

## Connections and possible references

| Signal | What it establishes |
|---|---|
| **Employee connections** | The profile lists an employee ID found in WSC's roster. Unknown IDs are flagged and do not count. |
| **Possible references** | Dated histories show overlapping years at the same employer. Employer names are matched loosely; generic names such as “Startup” are ignored. |

Neither signal proves the people worked together or that the employee recommends the candidate. A recruiter must confirm the relationship.

## Conference relevance

A separate check labels each attendance **relevant**, **adjacent** or **not relevant** to that event's topic, using skills and industry. It never excludes someone from job matching.

This evidence appears in the CSV's `event_assessments` and the integration demo's event activity. The recruiter view shows the conferences attended without that relevance label.

## Messy data

| Situation | Treatment |
|---|---|
| No LinkedIn URL, a non-profile URL, or no matching profile | Keep the person for review; next step "find their profile" |
| Several profiles for one LinkedIn URL | Not scored; needs review |
| Returning attendee, or a known person's email or URL spelled differently (`uk.linkedin.com/…`, `…/en`, `%2D`) | One person with all their events |
| Exact duplicate row, or a skill repeated in a job's list | Counted once; noted |
| One LinkedIn URL with different names, or a name that differs from the profile | Flagged; needs review, never shortlisted |
| One person has work and personal emails | One record; conflicting email is blank and flagged; scoring continues |
| Separate people share an email, a source ID or a name | Kept separate, never merged. Both are flagged, and invites, reference requests and handoffs for either wait for review. The flag and the block use the same identifiers: every source ID and email on any of a person's rows, the LinkedIn URL and the name |

Full merge and history rules: [Identity and history](additional-info/identity-and-history.md). File and event validation: [Importing and events](additional-info/importing-and-events.md).

## Limits

**The shortlist has not been validated against hiring-manager decisions.** The 60% threshold, experience minimums, must-haves and skill mappings are assumptions.

**Likely skills are leads, not facts.** They keep people like Mason Young (TensorFlow for PyTorch, Highlight Detection for Object Detection) in review rather than out of sight. They never count toward the 60% threshold; the one place they count is a JOB001 must-have.

**Known missed signal: Tobias Braun.** His profile lists ML Architecture and SageMaker, but the JOB001 core-discipline list recognizes neither. The current output marks him not recommended and says “No machine learning or computer vision skill on profile”. That explanation is too broad. His hands-on computer-vision experience is unconfirmed; this case warrants recruiter review. This limitation remains in the current rules and CSV.

Before operational use, ask a hiring manager to independently assess examples from **all three outcomes**. Check strong candidates missed, weak candidates recommended and the work left in the review queue. Tune the general rules against those decisions.

## Results on the supplied data

| Role | Shortlist | Needs review | Not recommended |
|---|---|---|---|
| JOB001 Senior ML Engineer | 6 | 6 | 63 |
| JOB002 Backend Engineer | 3 | 8 | 64 |
| JOB003 Senior Product Manager, Sports Data | 0 | 5 | 70 |
| JOB004 Data Engineer | 12 | 1 | 62 |

No supplied product manager lists Sports Analytics, so JOB003 has five people in review and no shortlist. Counts describe the current rules' output, not confirmed candidate quality.

## Accepted equivalents

Technical reference for reviewers checking the rules. Each job skill also matches its own name; this table lists accepted evidence. “Related” and “suggested” do not count toward the 60% threshold.

| Job skill | On profile | Related skill (likely, please confirm) | Suggested by related work (likely, please confirm) |
|---|---|---|---|
| Python | Python | Python Basics | |
| PyTorch | PyTorch | TensorFlow, Keras, Deep Learning, Machine Learning | |
| Computer Vision | Computer Vision, OpenCV, Sports CV | Pose Estimation, Sports Tracking, Video Understanding, Video Analytics, Object Detection, YOLO | |
| Object Detection | Object Detection, YOLO | | Sports Tracking, Pose Estimation, Sports CV, Highlight Detection, Event Detection, Action Detection |
| AWS | AWS, SageMaker | GCP, Azure | |
| Sports Analytics | Sports Analytics, Football Analytics, Performance Analytics | Sports Data, Real-time Sports Data, Sports Broadcasting, Sports Digital, Sports Rights | |
| Real-time processing | Real-time Processing, Real-time | | |
| Docker | Docker | Kubernetes | |
| Go | Go, Golang | | |
| Microservices | Microservices | Kubernetes, Spring Boot | |
| REST APIs | REST APIs, REST API | APIs, WebSockets, Django, Spring Boot, Spring, Node.js | |
| Video streaming | Video Streaming, Live Streaming, HLS | Streaming, CDN | |
| API Products | API Products | APIs, Broadcast APIs, Data Products | |
| OTT platforms | OTT | B2C Streaming | |
| Broadcast tech | Broadcast APIs, Sports Broadcasting, Broadcast Systems | | |
| SQL | SQL | Snowflake, PostgreSQL | |
| Sports domain knowledge | Sports, Sports Data, Sports Analytics, Football Analytics, Real-time Sports Data, Sports Data Feeds | | |
| Product Management, Stakeholder Management, Kafka, Spark, dbt, Airflow, FFmpeg, Redis, Terraform | Their own name only | | |

Only spelling variants work both ways: **Go/Golang** and **REST API/REST APIs**. Other mappings are one-way: SageMaker counts as AWS, but AWS does not establish SageMaker.

A narrower name (SageMaker, OpenCV, HLS, Football Analytics and the other extra names above) required alone matches only its own name: a job asking for SageMaker needs SageMaker on the profile, not AWS. A job asking for **AWS and SageMaker** has two requirements; order does not matter. The same applies to Computer Vision/OpenCV, Video Streaming/HLS and Sports Analytics/Football Analytics. Unlisted skills match only their own names.

These rules keep custom roles from silently losing a requirement. The first submitted version merged any name in a skill's "On profile" list into that skill, so order mattered ("Golang, Go" found nobody; "SageMaker, AWS" scored only SageMaker). Since the fix, a role requiring Python, Computer Vision, Object Detection, OpenCV under the provisional default has 4 requirements and shortlists 1 person instead of 10, with 42 in review; "SageMaker, AWS" goes from 0 to 31 in review; "OpenCV, Sports CV" from 1 shortlisted to 0 with 2 in review; "HLS, Live Streaming" from 3 shortlisted to 1 with 6 in review. The four supplied roles do not use such names and their results are unchanged.

## Core-discipline reference

For the four supplied roles, a populated profile with none of the relevant terms below is currently marked not recommended. This is a limited vocabulary, not a complete definition of a profession. A new role's core is its confirmed core skills.

| Role | Recognized core evidence |
|---|---|
| JOB001 | PyTorch, TensorFlow, Keras, Deep Learning, Machine Learning, Computer Vision, OpenCV, YOLO, Object Detection, Sports CV, Pose Estimation, Sports Tracking, Video Understanding, Video Analytics, Highlight Detection, Event Detection, Action Detection |
| JOB002 | Kafka, Microservices, REST APIs, REST API |
| JOB003 | Product Management |
| JOB004 | Spark, dbt, Airflow |

Implementation: [rules](../pipeline/rules.ts). Keep this reference and the rule definitions aligned.
