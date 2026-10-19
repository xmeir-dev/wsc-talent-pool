/**
 * The import preview must report what the import actually does to the pool.
 * Synthetic fixtures only.
 */
import { describe, expect, it } from 'vitest';
import { assessJob, buildDataset } from '../../pipeline';
import { loadSources } from '../../cli/load-sources';
import { applyImport, previewImport } from '../../integration-demo/sources';
import { FIXTURE_DIR } from '../helpers';

const HEADER = 'full_name,email,company,title,conference_name,conference_date,linkedin_url,top_skills';
const sources = loadSources(FIXTURE_DIR);
const before = buildDataset(sources).candidates.length;

function run(...lines: string[]) {
  const p = previewImport([HEADER, ...lines].join('\n') + '\n', sources);
  if (!p.ok) throw new Error(p.problems.join('; '));
  const after = buildDataset(applyImport(p.rows, sources));
  return { p, after, added: after.candidates.length - before };
}

describe('preview agrees with the pool after import', () => {
  it('an existing email without a LinkedIn URL is the same person: an added event, not a new contact', () => {
    const { p, added } = run('Tia Tied,tia@leaguevision.test,LeagueVision,ML Engineer,QA Meetup,2026-10-17,,');
    expect(added).toBe(0);
    expect({ created: p.created, merged: p.merged }).toEqual({ created: 0, merged: 1 });
    expect(p.uncertain).toEqual([]);
  });

  it('two rows for one new person preview as one new contact', () => {
    const { p, added } = run(
      'Nia New,nia@new.test,NewCo,ML Engineer,QA Meetup,2026-10-17,linkedin.com/in/nia-new,Python',
      'Nia New,nia@new.test,NewCo,ML Engineer,QA Meetup 2,2026-10-18,linkedin.com/in/nia-new,Python',
    );
    expect(added).toBe(1);
    expect(p.created).toBe(1);
    expect(p.merged).toBe(1);
    expect(p.uncertain).toEqual([]);
  });

  it('a repeat attendee by LinkedIn URL is matched and adds no contact', () => {
    const { p, added } = run('Tia Tied,tia@leaguevision.test,LeagueVision,ML Engineer,QA Meetup,2026-10-17,linkedin.com/in/tia-tied,');
    expect(added).toBe(0);
    expect({ created: p.created, merged: p.merged }).toEqual({ created: 0, merged: 1 });
    expect(p.uncertain).toEqual([]);
  });

  it('a known LinkedIn URL under a different name is explained and held for review', () => {
    const { p, after, added } = run('Someone Different,different@example.test,ElseCo,Analyst,QA Meetup,2026-10-17,linkedin.com/in/tia-tied,');
    expect(added).toBe(0);
    expect(p.merged).toBe(1);
    expect(p.uncertain).toHaveLength(1);
    expect(p.uncertain[0]).toMatch(/Someone Different/);
    const held = assessJob(after, 'JOB001').candidates.find((c) => c.candidate.linkedinUrl === 'linkedin.com/in/tia-tied')!;
    expect(held.recommendation).toBe('needs_review');
  });
});
