# How candidates are ranked

**Each person gets points for skills their LinkedIn profile shows. A few must-have checks then decide whether they are shortlisted, need a recruiter's look, or don't fit this role.** Connections to WSC employees never change that decision. Every row in the output explains its result in words, so nothing is a black box. Rule version: `rules-v1`.

## The three outcomes

| Outcome | Meaning |
|---|---|
| **Shortlist** | Shows every must-have for the role, enough of the required skills, and enough years. Ready for a screening call. |
| **Needs review** | Promising or unclear. Something is missing, below a bar, or the data is incomplete. A recruiter decides. |
| **Not recommended for this role** | Shows nothing of the role's core discipline (e.g. no machine-learning or computer-vision skill for the ML role). They stay in the talent pool for other roles. |

Missing information is not proof of missing ability. Anyone without a usable LinkedIn profile, or whose profile might belong to someone else, goes to **needs review**, never "not recommended".

## How points work

Points come only from the skills listed on the profile, plus one industry bonus for the ML role.

| Evidence | Points |
|---|---|
| Required skill named on the profile | 2 |
| Required skill shown through an accepted equivalent (e.g. TensorFlow for PyTorch) | 1, shown as "partial" |
| Required skill inferred from related work (Object Detection from tracking, pose estimation or sports computer vision) | 1, shown as "inferred, verify" |
| Each nice-to-have skill | +1 |
| Senior ML Engineer only: sports, league, media, broadcast, streaming or OTT industry or skills | +1 |

Job titles earn no points. Work history is shown as evidence instead: total years can include internships and junior roles, so total years are not the same as years in the specialty. Anyone whose current title suggests leadership (Head of, Lead, Principal, Architect, Director, VP, CTO) is marked "confirm hands-on". "Product Manager" on its own is not a leadership title.

## The shortlist checks

Points rank people; these checks decide the outcome. To be shortlisted, a person needs **all** of:

1. every must-have skill for the role (below);
2. at least 60% of the required-skill points (6 of 10, 8 of 12, or 5 of 8);
3. at least the minimum years for the job's seniority: Senior 5, Mid-Senior 4, Mid 3.

Collecting supporting skills never makes up for a missing must-have.

| Role | Must-haves for the shortlist | Core discipline (none → not recommended) |
|---|---|---|
| JOB001 Senior ML Engineer | Computer-vision evidence, and PyTorch or related deep-learning evidence (named or partial; see equivalents) | Machine learning or computer vision |
| JOB002 Backend Engineer | Python or Go, named | Kafka, microservices or REST APIs |
| JOB003 Senior Product Manager – Sports Data | Product Management and Sports Analytics, both named. Sports broadcasting or data-product experience can earn needs review but never counts as Sports Analytics. | Product management |
| JOB004 Data Engineer | Python, named | Spark, dbt or Airflow |

Missing AWS alone does not keep anyone off the JOB001 shortlist; it appears as a gap to confirm.

## Accepted equivalents

| Job skill | Counts as named | Counts as partial (1 point) |
|---|---|---|
| PyTorch | PyTorch | TensorFlow, Keras, Deep Learning, Machine Learning |
| Computer Vision | Computer Vision, OpenCV, Sports CV | Pose Estimation, Sports Tracking, Video Understanding, Video Analytics, Object Detection, YOLO |
| Object Detection | Object Detection, YOLO | *Inferred, verify:* Sports Tracking, Pose Estimation, Sports CV |
| AWS | AWS, SageMaker | GCP, Azure |
| Sports Analytics | Sports Analytics, Football Analytics, Performance Analytics | Sports Data, Sports Broadcasting, Sports Digital, Sports Rights |
| REST APIs | REST APIs | APIs, WebSockets, Django, Spring, Spring Boot, Node.js |
| Microservices | Microservices | Kubernetes, Spring Boot |
| SQL | SQL | Snowflake, PostgreSQL |
| API Products | API Products | APIs, Broadcast APIs, Data Products |

Any other skill counts only when the profile names it. The full list lives in `pipeline/rules.ts`.

## Ties and connections

- People are ordered by total points. Connections never lift anyone over a points gap.
- A **close tie** means identical points. Within a tie, someone with at least one WSC employee connection ranks first. The number of connections does not matter.
- When tied people are all connected, or none are, they share a rank and are marked **tied**. They are listed alphabetically; that order is not a preference.

## Connections and possible references

These are two separate columns, and neither affects the outcome:

- **Employee connections**: WSC employees the profile lists as mutual LinkedIn connections. Only IDs found on the employee roster are counted; unknown IDs are flagged.
- **Possible references**: WSC employees who worked at the same employer in overlapping years, matched from dated work history. Employer names are matched loosely ("Akamai" matches "Akamai Technologies"), so treat these as leads to check.

## Conference relevance

Each event a person attended is marked relevant, adjacent, or not relevant, based on whether their skills and industry match the conference's topic. This sorts the talent pool. It never removes anyone from job matching: a strong ML engineer met at a DevOps conference is still assessed for the ML role.

## Messy data

| Situation | What happens |
|---|---|
| No LinkedIn URL, a non-profile URL, or no matching profile | Kept; needs review; "find their profile" as the next step |
| The same person at several events | One row listing every event |
| An exact duplicate row | Dropped and noted |
| Different names, emails or profiles for what looks like one person | Not merged or guessed; flagged; needs review |
| Two people with the same name | Kept separate; names alone never merge records |

## Important caveat

**The 60% bar, the minimum years, the must-haves and the equivalents above are stated assumptions for this exercise, not validated hiring standards.** They should be reviewed with the hiring managers and checked against past hiring decisions before anyone relies on them.

## Results on the supplied data

| Role | Shortlist | Needs review | Not recommended |
|---|---|---|---|
| JOB001 Senior ML Engineer | 6 | 6 | 63 |
| JOB002 Backend Engineer | 3 | 8 | 64 |
| JOB003 Senior Product Manager – Sports Data | 0 | 5 | 70 |
| JOB004 Data Engineer | 12 | 1 | 62 |

JOB003 has no shortlist because no product manager in the data names Sports Analytics. The five product managers wait in needs review, with their closest sports experience shown.
