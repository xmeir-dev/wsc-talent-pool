/**
 * Data problems the brief warns about. The real data has none of them, so these use the
 * synthetic fixtures in tests/fixtures/synthetic/ (made-up people, never mixed into data/).
 */
import { describe, expect, it } from 'vitest';
import { buildDataset, DataValidationError, UnknownJobError } from '../../pipeline';
import { loadSources } from '../../cli/load-sources';
import { assessJob, byName, FIXTURE_DIR, fixtureDataset } from '../helpers';

const dataset = fixtureDataset();
const result = assessJob(dataset, 'JOB001');

describe('missing or unusable profiles stay in the list as needs_review', () => {
  it.each([
    ['Mia Missing', 'missing_url'],
    ['Ivy Invalid', 'invalid_url'],
    ['Ned Nomatch', 'unmatched'],
  ])('%s → %s', (name, status) => {
    const c = byName(result, name);
    expect(c.candidate.profileStatus).toBe(status);
    expect(c.recommendation).toBe('needs_review');
    expect(c.outcomeReasons[0]).toContain('missing information is not proof of missing ability');
    expect(c.reviewNextStep).toContain('LinkedIn profile');
  });

  it('keeps every attendee accounted for', () => {
    const contactIds = new Set(result.candidates.flatMap((c) => c.candidate.sourceContactIds));
    // 39 rows, IDs HS101-HS137: one exact duplicate row, two repeat attendees, one reused ID (two people).
    expect(contactIds.size).toBe(37);
    expect(result.candidates).toHaveLength(36);
  });
});

describe('duplicates and repeat attendees', () => {
  it('combines a repeat attendee into one row with every event', () => {
    const tia = byName(result, 'Tia Tied');
    expect(tia.candidate.sourceContactIds).toEqual(['HS103', 'HS104']);
    expect(tia.events.map((e) => e.attendance.conferenceName)).toEqual(['SportsTech Innovation Summit', 'Data & AI Summit Europe']);
  });

  it('treats URL variants as the same person', () => {
    expect(byName(result, 'Tia Tied').candidate.dataQualityFlags.join(' ')).not.toContain('different LinkedIn URLs');
  });

  it('drops an exact duplicate row and flags it', () => {
    const ula = byName(result, 'Ula Unlinked');
    expect(ula.events).toHaveLength(1);
    expect(ula.dataQualityFlags).toContain('duplicate attendee row HS105 ignored');
  });

  it('flags conflicting emails for one person and leaves the email blank', () => {
    const eve = byName(result, 'Eve Email');
    expect(eve.candidate.email).toBe('');
    expect(eve.dataQualityFlags.join(' ')).toContain('eve@old.test / eve@new.test');
  });

  it('never merges people by name alone', () => {
    const chrises = result.candidates.filter((c) => c.candidate.fullName === 'Chris Same');
    expect(chrises).toHaveLength(2);
    expect(chrises.map((c) => c.recommendation).sort()).toEqual(['not_recommended_for_role', 'shortlist']);
  });

  it('flags two URLs sharing an email as a possible duplicate without merging', () => {
    const sids = result.candidates.filter((c) => c.candidate.fullName === 'Sid Shared');
    expect(sids).toHaveLength(2);
    for (const s of sids) expect(s.dataQualityFlags.join(' ')).toContain('possible duplicate person, not merged');
  });

  it('keeps keys unique when a HubSpot ID is reused for different people', () => {
    const keys = result.candidates.map((c) => c.candidate.candidateKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(byName(result, 'Different Person').dataQualityFlags.join(' ')).toContain('HubSpot ID HS137 also used by');
  });

  it('warns about an exact duplicate profile row', () => {
    expect(dataset.warnings).toContain('profiles: exact duplicate row for linkedin.com/in/sam-strong ignored');
  });
});

describe('conflicts stay unresolved and visible', () => {
  it('flags a name that differs from its profile and holds it at needs_review', () => {
    const jon = byName(result, 'Jon Smith');
    expect(jon.candidate.profileStatus).toBe('conflict');
    expect(jon.tally.required).toBe(5); // evidence shown, but not trusted
    expect(jon.recommendation).toBe('needs_review');
    expect(jon.dataQualityFlags.join(' ')).toContain('Jonathan Smythe');
  });

  it('does not score when two different profiles share one URL', () => {
    const dana = byName(result, 'Dana Dup');
    expect(dana.candidate.profileStatus).toBe('conflict');
    expect(dana.candidate.profile).toBeNull();
    expect(dana.recommendation).toBe('needs_review');
  });

  it('sends a profile with no skills to needs_review, not not_recommended', () => {
    expect(byName(result, 'Nils NoSkills').recommendation).toBe('needs_review');
  });
});

describe('invalid input', () => {
  it('rejects a file with a missing column, naming it', () => {
    const sources = loadSources(FIXTURE_DIR);
    sources.profiles = sources.profiles.replace('top_skills', 'skills');
    expect(() => buildDataset(sources)).toThrow(DataValidationError);
    expect(() => buildDataset(sources)).toThrow(/profiles: missing column\(s\) top_skills/);
  });

  it('rejects an empty file', () => {
    const sources = { ...loadSources(FIXTURE_DIR), jobs: '' };
    expect(() => buildDataset(sources)).toThrow(/jobs: file is empty/);
  });

  it('rejects an unknown job_id and lists the known ones', () => {
    expect(() => assessJob(dataset, 'JOB999')).toThrow(UnknownJobError);
    expect(() => assessJob(dataset, 'JOB999')).toThrow(/Known: JOB001, JOB002, JOB003, JOB004, JOB005/);
  });

  it('accepts a lower-case job_id', () => {
    expect(assessJob(dataset, 'job001').job.jobId).toBe('JOB001');
  });

  it('applies a flagged default policy to a job without a written one', () => {
    const job5 = assessJob(dataset, 'JOB005');
    expect(job5.candidates[0]!.dataQualityFlags.join(' ')).toContain('no written policy for JOB005');
  });
});
