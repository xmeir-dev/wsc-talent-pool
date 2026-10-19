/** Shared types for the candidate-ranking pipeline. */

import type { EventEdition } from './events';
import type { PersonIdentity } from './identity';

// ---------- Source records (as supplied in data/) ----------

export interface AttendeeRecord {
  hubspot_id: string;
  full_name: string;
  email: string;
  company: string;
  title: string;
  conference_name: string;
  conference_domain: string;
  conference_date: string;
  source: string;
  notes: string;
  linkedin_url: string;
  /** Optional: the organiser's ID for this event edition. When present it decides the edition (events.ts). */
  event_id?: string;
}

export interface ProfileRecord {
  linkedin_url: string;
  full_name: string;
  current_company: string;
  current_title: string;
  location: string;
  years_experience: string;
  top_skills: string;
  industry: string;
  past_companies: string;
  past_titles: string;
  wsc_mutual_connections: string;
}

export interface EmployeeRecord {
  employee_id: string;
  full_name: string;
  title: string;
  department: string;
  linkedin_id: string;
  work_history: string;
}

export interface JobRecord {
  job_id: string;
  title: string;
  department: string;
  seniority: string;
  key_domains: string;
  required_skills: string;
  nice_to_have: string;
}

/** Raw text of the four supplied files. The browser and the CLI each load these their own way. */
export interface SourceTexts {
  attendees: string;
  profiles: string;
  employees: string;
  jobs: string;
}

// ---------- Combined evidence ----------

export type ProfileStatus = 'matched' | 'missing_url' | 'unmatched' | 'invalid_url' | 'conflict';

export interface Job {
  jobId: string;
  title: string;
  department: string;
  seniority: string;
  keyDomains: string[];
  requiredSkills: string[];
  niceToHave: string[];
}

export interface Employee {
  employeeId: string;
  fullName: string;
  title: string;
  department: string;
  workHistory: EmploymentSpell[];
}

/** A year range. `end` is Infinity for "present". */
export interface Period {
  start: number;
  end: number;
}

/** One stint at one employer, parsed from "Title at Company (2019-2022)" or "Company (2019-2022)". */
export interface EmploymentSpell {
  raw: string;
  title: string;
  company: string;
  /** Usually one; "2016-2020 then rejoined 2022" gives two. Empty when no years are given. */
  periods: Period[];
  isEarlyCareer: boolean;
}

export interface Profile {
  linkedinUrl: string;
  fullName: string;
  currentCompany: string;
  currentTitle: string;
  location: string;
  yearsExperience: number | null;
  skills: string[];
  industry: string;
  pastCompanies: string[];
  pastRoles: EmploymentSpell[];
  connectionIds: string[];
}

export interface Attendance {
  /**
   * One person at one event edition: A-<16 hex> of person ID + edition key (identity.ts, events.ts).
   * Several rows for the same person and edition are one attendance. Not the person's ID, not the source contact ID.
   */
  attendanceId: string;
  /** The event edition (EventEdition.key): which run of the conference this was. */
  editionKey: string;
  /** The edition as it reads on screen ("SportsTech Innovation Summit (2026)"; the name alone when unambiguous). */
  editionLabel: string;
  /** The supplied event ID, or ''. */
  eventId: string;
  /** The source contact ID on this row, as supplied; may repeat or be blank. */
  hubspotId: string;
  conferenceName: string;
  conferenceDomain: string;
  conferenceDate: string;
  source: string;
  notes: string;
  /** What the attendee list said about the person at that event. */
  listedTitle: string;
  listedCompany: string;
}

/** One person, with every attendance record and (when resolvable) one LinkedIn profile. */
export interface Candidate {
  /** The durable person ID (identity.ts): C-<source ID> for supplied people, else P-<16 hex>. Owns all saved history. */
  candidateKey: string;
  /** How the person was identified, and whether that identity is safe to act on. */
  identity: PersonIdentity;
  sourceContactIds: string[];
  fullName: string;
  email: string;
  linkedinUrl: string;
  attendances: Attendance[];
  profileStatus: ProfileStatus;
  /** Present when the profile is matched, or when a name conflict still leaves one profile to show. */
  profile: Profile | null;
  dataQualityFlags: string[];
}

export interface Dataset {
  jobs: Job[];
  employees: Map<string, Employee>;
  candidates: Candidate[];
  /** Every event edition in the attendee file, by first date (undated last). */
  editions: EventEdition[];
  /** File-level problems (e.g. a duplicate employee ID). Row-level problems sit on the candidate. */
  warnings: string[];
}

// ---------- Assessment ----------

export type Recommendation = 'shortlist' | 'needs_review' | 'not_recommended_for_role';

export type MatchKind = 'named' | 'equivalent' | 'inferred' | 'none';

export interface SkillMatch {
  skill: string;
  kind: 'required' | 'nice_to_have';
  match: MatchKind;
  /** The profile skill that produced the match, as written on the profile. */
  evidence: string | null;
}

export interface Seniority {
  totalYears: number | null;
  roles: EmploymentSpell[];
  earlyCareerRoles: EmploymentSpell[];
  seniorTitleFlag: string | null;
  summary: string;
}

export interface ConnectionInfo {
  status: 'listed' | 'none_listed' | 'unknown' | 'partially_resolved';
  /** Resolved WSC employees only. null when the profile is unavailable. */
  count: number | null;
  resolved: Employee[];
  unresolvedIds: string[];
}

export interface PossibleReference {
  employeeId: string;
  employeeName: string;
  company: string;
  overlapStart: number;
  overlapEnd: number;
  /** True when this employee is also one of the candidate's listed connections. */
  alsoListedConnection: boolean;
}

export type ConferenceRelevance = 'relevant' | 'adjacent' | 'not_relevant' | 'unknown';

export interface EventAssessment {
  attendance: Attendance;
  relevance: ConferenceRelevance;
  matchedTerms: string[];
  explanation: string;
}

/** How many of the job's skills the profile shows. Counts, not points: one rule for every job. */
export interface SkillTally {
  /** Required skills on the profile by name. */
  required: number;
  /** Required skills shown only by a related or likely skill: to confirm, not counted for the shortlist. */
  requiredLikely: number;
  requiredTotal: number;
  /** Named required skills the shortlist needs (SHORTLIST_REQUIRED_SHARE of requiredTotal, rounded up). */
  requiredNeeded: number;
  /** Nice-to-have skills on the profile, by name or a related skill. */
  niceToHave: number;
  niceToHaveTotal: number;
  /** The role's industry (e.g. sports media) shows on the profile; only breaks ties in the ranking. */
  industryMatch: boolean;
}

export interface CandidateAssessment {
  candidate: Candidate;
  jobId: string;
  recommendation: Recommendation;
  /** 1-based; tied people share a rank. null outside the shortlist. */
  shortlistRank: number | null;
  /** Explains a tie or a tie-break; empty when the person is not tied. */
  tieNote: string;
  tally: SkillTally;
  skills: SkillMatch[];
  missingEssentials: string[];
  outcomeReasons: string[];
  fitEvidence: string[];
  skillGaps: string[];
  industryBonusEvidence: string;
  seniority: Seniority;
  connections: ConnectionInfo;
  possibleReferences: PossibleReference[];
  events: EventAssessment[];
  reviewNextStep: string;
  dataQualityFlags: string[];
}

export interface JobAssessment {
  job: Job;
  assessmentVersion: string;
  /** Ordered: shortlist by rank, then needs_review, then not_recommended_for_role. */
  candidates: CandidateAssessment[];
  counts: Record<Recommendation, number>;
  warnings: string[];
}
