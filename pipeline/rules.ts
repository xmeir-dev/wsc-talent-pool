/**
 * Every scoring rule in one place. docs/scoring.md explains these in plain English;
 * change both together and bump ASSESSMENT_VERSION.
 *
 * All terms are compared after normalize(): lower case, trimmed, single spaces.
 */

export const ASSESSMENT_VERSION = 'rules-v3';

// ---------- Skill counts ----------

/**
 * Stated assumption, not a validated hiring standard, one rule for every job: the share of a job's required
 * skills that must be on the profile by name for the shortlist, rounded up (3 of 4, 3 of 5, 4 of 6).
 */
export const SHORTLIST_REQUIRED_SHARE = 0.6;

/** Stated assumption, not a validated hiring standard: minimum total years by the job's seniority label. */
export const MIN_YEARS_BY_SENIORITY: Record<string, number> = {
  junior: 0,
  mid: 3,
  'mid-senior': 4,
  senior: 5,
};

// ---------- Skill evidence ----------

export interface SkillEvidenceRule {
  /** Profile skills that count as the skill itself: the skill is on the profile. */
  named: string[];
  /** Related skills, e.g. TensorFlow for PyTorch: "likely", not counted for the shortlist, sends to review. */
  equivalent?: string[];
  /** Indirect evidence, labelled "likely, please confirm". */
  inferred?: string[];
}

/** Keyed by the job's skill name, normalized. A job skill missing here matches its own name only. */
export const SKILL_EVIDENCE: Record<string, SkillEvidenceRule> = {
  python: { named: ['python'], equivalent: ['python basics'] },
  pytorch: { named: ['pytorch'], equivalent: ['tensorflow', 'keras', 'deep learning', 'machine learning'] },
  'computer vision': {
    named: ['computer vision', 'opencv', 'sports cv'],
    equivalent: ['pose estimation', 'sports tracking', 'video understanding', 'video analytics', 'object detection', 'yolo'],
  },
  'object detection': {
    named: ['object detection', 'yolo'],
    // Highlight/event detection in sports video usually means detecting players, ball or actions; verify.
    inferred: ['sports tracking', 'pose estimation', 'sports cv', 'highlight detection', 'event detection', 'action detection'],
  },
  aws: { named: ['aws', 'sagemaker'], equivalent: ['gcp', 'azure'] },
  'sports analytics': {
    named: ['sports analytics', 'football analytics', 'performance analytics'],
    // Sports broadcasting / data-product experience is related but never the skill itself.
    equivalent: ['sports data', 'real-time sports data', 'sports broadcasting', 'sports digital', 'sports rights'],
  },
  'real-time processing': { named: ['real-time processing', 'real-time'] },
  docker: { named: ['docker'], equivalent: ['kubernetes'] },
  go: { named: ['go', 'golang'] },
  kafka: { named: ['kafka'] },
  microservices: { named: ['microservices'], equivalent: ['kubernetes', 'spring boot'] },
  'rest apis': { named: ['rest apis', 'rest api'], equivalent: ['apis', 'websockets', 'django', 'spring boot', 'spring', 'node.js'] },
  ffmpeg: { named: ['ffmpeg'] },
  'video streaming': { named: ['video streaming', 'live streaming', 'hls'], equivalent: ['streaming', 'cdn'] },
  redis: { named: ['redis'] },
  'product management': { named: ['product management'] },
  'api products': { named: ['api products'], equivalent: ['apis', 'broadcast apis', 'data products'] },
  'stakeholder management': { named: ['stakeholder management'] },
  'ott platforms': { named: ['ott'], equivalent: ['b2c streaming'] },
  'broadcast tech': { named: ['broadcast apis', 'sports broadcasting', 'broadcast systems'] },
  sql: { named: ['sql'], equivalent: ['snowflake', 'postgresql'] },
  spark: { named: ['spark'] },
  dbt: { named: ['dbt'] },
  airflow: { named: ['airflow'] },
  'sports domain knowledge': {
    named: ['sports', 'sports data', 'sports analytics', 'football analytics', 'real-time sports data', 'sports data feeds'],
  },
  terraform: { named: ['terraform'] },
};

// ---------- Per-role policy ----------

export interface Essential {
  label: string;
  /** Satisfied when ANY of these job skills is on the profile by name (or, with allowRelated, by a related skill). */
  anyOf: string[];
  allowRelated: boolean;
}

export interface RolePolicy {
  /** All must hold for the shortlist. Missing one → needs_review. */
  essentials: Essential[];
  /** The role's core discipline. No evidence at all → not_recommended_for_role. */
  coreDiscipline: { label: string; terms: string[] };
  /** Roles without an industry bonus have null. */
  industryBonus: { label: string; terms: string[] } | null;
}

export const ROLE_POLICIES: Record<string, RolePolicy> = {
  JOB001: {
    essentials: [
      { label: 'Computer Vision', anyOf: ['Computer Vision'], allowRelated: true },
      { label: 'PyTorch or related deep learning', anyOf: ['PyTorch'], allowRelated: true },
    ],
    coreDiscipline: {
      label: 'machine learning or computer vision',
      terms: [
        'pytorch', 'tensorflow', 'keras', 'deep learning', 'machine learning', 'computer vision', 'opencv',
        'yolo', 'object detection', 'sports cv', 'pose estimation', 'sports tracking', 'video understanding',
        'video analytics', 'highlight detection', 'event detection', 'action detection',
      ],
    },
    industryBonus: {
      label: 'sports, league, media, broadcast, streaming or OTT',
      terms: ['sport', 'league', 'media', 'broadcast', 'streaming', 'ott'],
    },
  },
  JOB002: {
    essentials: [{ label: 'Python or Go', anyOf: ['Python', 'Go'], allowRelated: false }],
    coreDiscipline: { label: 'backend services', terms: ['kafka', 'microservices', 'rest apis', 'rest api'] },
    industryBonus: null,
  },
  JOB003: {
    essentials: [
      { label: 'Product Management', anyOf: ['Product Management'], allowRelated: false },
      { label: 'Sports Analytics', anyOf: ['Sports Analytics'], allowRelated: false },
    ],
    coreDiscipline: { label: 'product management', terms: ['product management'] },
    industryBonus: null,
  },
  JOB004: {
    essentials: [{ label: 'Python', anyOf: ['Python'], allowRelated: false }],
    coreDiscipline: { label: 'data pipelines', terms: ['spark', 'dbt', 'airflow'] },
    industryBonus: null,
  },
};

// ---------- Seniority ----------

/** Current titles that suggest leading rather than hands-on work. "Product Manager" is a craft title, not a flag. */
export const SENIOR_TITLE_PATTERNS: RegExp[] = [
  /\bhead of\b/i,
  /\blead\b/i,
  /\bprincipal\b/i,
  /\barchitect\b/i,
  /\bdirector\b/i,
  /\bvp\b|\bvice president\b/i,
  /\bchief\b|\bcto\b|\bcpo\b|\bceo\b/i,
  /\bengineering manager\b/i,
];

/** Past roles that count toward total years but are not full professional experience. */
export const EARLY_CAREER_PATTERNS: RegExp[] = [
  /\bintern\b/i,
  /\binternship\b/i,
  /\bresearch (assistant|asst)\b/i,
  /\bjunior\b/i,
];

// ---------- Possible references ----------

/** Employer names too generic to identify a shared workplace. */
export const GENERIC_EMPLOYERS = new Set([
  'startup', 'freelance', 'university', 'agency', 'retailer', 'ngo', 'public sector', 'private clinic',
  'fintech', 'fintech startup', 'food startup', 'betting startup', 'shipping startup', 'farming startup',
  'law firm', 'factory group', 'hospital group', 'retail', 'university research lab',
]);

/** Words dropped before comparing employer names ("Akamai Technologies" = "Akamai"). */
export const EMPLOYER_NOISE_WORDS = new Set([
  'technologies', 'technology', 'tech', 'inc', 'ltd', 'llc', 'group', 'corp', 'corporation', 'co', 'the',
  'digital', 'online', 'software', 'media',
]);

// ---------- Conference relevance ----------

export interface ConferenceDomainRule {
  /** Profile skills (or industry) that show the person works in this domain. Substring match. */
  terms: string[];
  /** If set, "relevant" also needs at least one of these. */
  mustInclude?: string[];
}

/** Keyed by conference_domain, normalized. */
export const CONFERENCE_DOMAINS: Record<string, ConferenceDomainRule> = {
  'sports technology & analytics': {
    terms: [
      'sport', 'league', 'football', 'highlight', 'wearables', 'computer vision', 'opencv', 'yolo', 'machine learning',
      'deep learning', 'pytorch', 'tensorflow', 'real-time', 'tracking', 'pose estimation', 'video', 'analytics',
      'data', 'product management', 'streaming', 'broadcast', 'ott',
    ],
    mustInclude: ['sport', 'league', 'football', 'highlight'],
  },
  'data engineering & ai/ml': {
    terms: [
      'spark', 'dbt', 'airflow', 'kafka', 'snowflake', 'delta lake', 'sql', 'pytorch', 'tensorflow',
      'machine learning', 'deep learning', 'computer vision', 'sagemaker', 'scikit-learn', 'statistics', 'data', 'ml',
    ],
  },
  'devops & platform engineering': {
    terms: ['kubernetes', 'terraform', 'ci/cd', 'helm', 'jenkins', 'iac', 'monitoring', 'reliability', 'infrastructure', 'docker'],
  },
  'broadcast & video technology': {
    terms: [
      'ffmpeg', 'hls', 'dash', 'video', 'broadcast', 'streaming', 'camera', 'cdn', 'ott', 'evs', 'encoding',
      'live sport', 'sports production',
    ],
  },
};
