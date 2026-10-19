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

Unknown years cannot pass. An unsupported seniority, such as “Staff”, leaves otherwise qualifying people in review until the role is clarified. Supporting skills cannot compensate for a missing must-have.

| Role | Must-haves |
|---|---|
| JOB001 Senior ML Engineer | Computer Vision plus PyTorch or related deep learning. Related evidence can satisfy these must-haves, but never the 60% confirmed-skills threshold. |
| JOB002 Backend Engineer | Python or Go, confirmed |
| JOB003 Senior Product Manager, Sports Data | Product Management and Sports Analytics, both confirmed |
| JOB004 Data Engineer | Python, confirmed |

**Example:** Priya Anand is first for JOB001. Deep Learning satisfies the PyTorch must-have, while four other required skills are confirmed. Missing AWS alone does not block an ML shortlist; it remains a visible gap.

A new role without its own policy uses provisional rules: no must-haves, and any confirmed required skill establishes its core discipline. The result carries a warning. A hiring manager should define that role's policy before relying on it.

## How skills are counted

| Evidence | Treatment |
|---|---|
| Exact skill or accepted alias | Counts toward the required-skills threshold |
| Related skill or inferred experience | Shown for confirmation; does not count toward that threshold |
| Skill absent from the profile | Unconfirmed, not proof the person lacks it |

Matching ignores case and extra spaces, but uses whole skill names. “PyTorch Lightning” does not equal “PyTorch”. Repeated requirements count once. Nice-to-haves affect ordering only; exact, alias and related matches count, while inferred matches do not.

One profile skill can support several requirements: Sports CV confirms Computer Vision and suggests Object Detection. The [reference table](#accepted-equivalents) lists every mapping.

## Seniority and titles

The experience check uses the profile's **total years**, including internships and junior roles. It does not measure years in the specialty. Those histories are flagged for confirmation. Subtracting internships would move James Thornton and Nathan Brooks from the JOB001 shortlist into review.

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
| Missing, invalid, conflicting or multiple matching profiles | Keep the person for review |
| Returning attendee or exact duplicate row | One person with their events; duplicate rows are noted |
| Names or identifiers conflict | Flag the uncertainty; do not guess identity |
| One person has work and personal emails | One record; conflicting email is blank and flagged; scoring continues |
| Two people share a name | Keep both; contact actions wait for identity confirmation |

Full merge and history rules: [Identity and history](additional-info/identity-and-history.md). File and event validation: [Importing and events](additional-info/importing-and-events.md).

## Limits

**The shortlist has not been validated against hiring-manager decisions.** The 60% threshold, experience minimums, must-haves and skill mappings are assumptions.

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

A job asking for **AWS and SageMaker** has two requirements; order does not matter. The same applies to Computer Vision/OpenCV and Video Streaming/HLS. Unlisted skills match only their own names. These rules keep custom roles from silently losing a requirement.

## Core-discipline reference

A populated profile with none of the relevant terms below is currently marked not recommended. This is a limited vocabulary, not a complete definition of a profession.

| Role | Recognized core evidence |
|---|---|
| JOB001 | PyTorch, TensorFlow, Keras, Deep Learning, Machine Learning, Computer Vision, OpenCV, YOLO, Object Detection, Sports CV, Pose Estimation, Sports Tracking, Video Understanding, Video Analytics, Highlight Detection, Event Detection, Action Detection |
| JOB002 | Kafka, Microservices, REST APIs, REST API |
| JOB003 | Product Management |
| JOB004 | Spark, dbt, Airflow |

Implementation: [rules](../pipeline/rules.ts). Keep this reference and the rule definitions aligned.
