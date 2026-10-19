/** Listed connections vs possible references (shared employer, overlapping years). Neither is scored. */
import { describe, expect, it } from 'vitest';
import { sameEmployer } from '../../pipeline';
import { assessJob, byName, fixtureDataset, realDataset } from '../helpers';

const fixture = assessJob(fixtureDataset(), 'JOB001');

describe('employer matching', () => {
  it('matches names that contain each other, ignoring corporate suffixes', () => {
    expect(sameEmployer('Akamai', 'Akamai Technologies')).toBe(true);
    expect(sameEmployer('Sky Sports', 'Sky Sports Digital')).toBe(true);
    expect(sameEmployer('Opta Sports', 'Stats Perform / Opta')).toBe(true);
  });

  it('does not match different companies or generic employers', () => {
    expect(sameEmployer('Sky Italia', 'Sky Sports Digital')).toBe(false);
    expect(sameEmployer('startup', 'startup')).toBe(false);
    expect(sameEmployer('freelance', 'freelance sports analyst')).toBe(false);
  });
});

describe('possible references', () => {
  it('finds a shared employer with overlapping years, separate from listed connections', () => {
    const rex = byName(fixture, 'Rex Reference');
    expect(rex.connections.status).toBe('none_listed');
    expect(rex.possibleReferences).toEqual([
      expect.objectContaining({ employeeId: 'WSC002', company: 'Mobileye', overlapStart: 2019, overlapEnd: 2021, alsoListedConnection: false }),
    ]);
  });

  it('ignores a shared employer when the years do not overlap', () => {
    expect(byName(fixture, 'Old Timer').possibleReferences).toEqual([]);
  });

  it('marks a possible reference who is also a listed connection', () => {
    const priya = byName(assessJob(realDataset(), 'JOB001'), 'Priya Anand');
    const maya = priya.possibleReferences.find((r) => r.company === 'Mobileye')!;
    expect(maya).toMatchObject({ employeeId: 'WSC002', alsoListedConnection: true });
  });

  it('never changes skill counts or outcome', () => {
    const dataset = fixtureDataset();
    const before = byName(assessJob(dataset, 'JOB001'), 'Rex Reference');
    dataset.employees.clear();
    const after = byName(assessJob(dataset, 'JOB001'), 'Rex Reference');
    expect(after.possibleReferences).toEqual([]);
    expect(after.tally).toEqual(before.tally);
    expect(after.recommendation).toBe(before.recommendation);
  });
});

describe('listed connections', () => {
  it('counts only resolved employee IDs and reports partially_resolved', () => {
    const una = byName(fixture, 'Una Unresolved'); // WSC002 + WSC999
    expect(una.connections).toMatchObject({ status: 'partially_resolved', count: 1, unresolvedIds: ['WSC999'] });
    expect(una.dataQualityFlags.join(' ')).toContain('WSC999');
  });

  it('reports partially_resolved with count 0 when no listed ID resolves', () => {
    expect(byName(fixture, 'Zoe Ghost').connections).toMatchObject({ status: 'partially_resolved', count: 0 });
  });

  it('reports none_listed with 0, and unknown with a blank count when there is no profile', () => {
    expect(byName(fixture, 'Sam Strong').connections).toMatchObject({ status: 'none_listed', count: 0 });
    expect(byName(fixture, 'Mia Missing').connections).toMatchObject({ status: 'unknown', count: null });
  });

  it('matches the real data: 42 people list connections, 33 list none', () => {
    const result = assessJob(realDataset(), 'JOB001');
    const statuses = result.candidates.map((c) => c.connections.status);
    expect(statuses.filter((s) => s === 'listed')).toHaveLength(42);
    expect(statuses.filter((s) => s === 'none_listed')).toHaveLength(33);
  });
});
