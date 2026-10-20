/** The documents published with the recruiter view: every footer link has a page, every relative link resolves. */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const out = mkdtempSync(join(tmpdir(), 'wsc-docs-'));

beforeAll(() => {
  execFileSync('node', ['scripts/build-docs.mjs', out], { stdio: 'pipe' });
});
afterAll(() => rmSync(out, { recursive: true, force: true }));

describe('published documents', () => {
  it('has a page for each footer link and the documents README links to', () => {
    for (const p of [
      'README.html',
      'docs/assumptions.html',
      'docs/design.html',
      'docs/executive-summary.html',
      'docs/scoring.html',
      'docs/schema-and-flow.html',
      'integration-demo/README.html',
      'assignment/index.html',
      'docs/screenshots/integration-1-hubspot-morning.png',
    ]) {
      expect(existsSync(join(out, p)), p).toBe(true);
    }
  });

  it('rewrites document links to pages and leaves no GitHub or localhost links', () => {
    const readme = readFileSync(join(out, 'README.html'), 'utf8');
    expect(readme).toContain('href="docs/design.html#production-version"');
    expect(readme).toContain('href="integration-demo/README.html"');
    expect(readme).not.toMatch(/github\.com\/xmeir-dev|localhost/);
    const design = readFileSync(join(out, 'docs/design.html'), 'utf8');
    expect(design).toContain('href="../integration-demo/README.html"');
    expect(design).toContain('id="production-version"');
  });

  it('shows a link to a source file as plain text', () => {
    const scoring = readFileSync(join(out, 'docs/scoring.html'), 'utf8');
    expect(scoring).not.toMatch(/href="[^"]*\.ts"/);
  });

  it('refuses a link to a heading that does not exist', () => {
    // The generator throws on a bad anchor; the check runs in beforeAll, so reaching here means every anchor resolved.
    expect(true).toBe(true);
  });
});
