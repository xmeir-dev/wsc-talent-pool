/**
 * Publishes the project's Markdown documents as pages of the recruiter view, so the footer's
 * README / Assumptions / Design links work without GitHub access (the repository is private).
 *
 * Output mirrors the repository under view/public/project/ (served at /project/...): README.md
 * becomes /project/README.html, docs/design.md becomes /project/docs/design.html, and so on, so
 * the documents' relative links keep working with ".md" replaced by ".html". Screenshots and the
 * assignment brief are copied. Links to source files or data folders, which have no page, are
 * shown as plain text. A link to a page or heading that does not exist fails the build.
 *
 * Runs before `npm run dev` and `npm run build`; `node scripts/build-docs.mjs <dir>` writes elsewhere.
 */
import { Marked } from 'marked';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] ?? join(ROOT, 'view/public/project'));

/** Markdown documents published as pages, as repository paths. */
const PAGES = [
  'README.md',
  'integration-demo/README.md',
  ...readdirSync(join(ROOT, 'docs')).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`),
  ...readdirSync(join(ROOT, 'docs/additional-info'))
    .filter((f) => f.endsWith('.md'))
    .map((f) => `docs/additional-info/${f}`),
];
/** Files copied as they are. */
const COPIED = ['assignment/index.html', 'docs/screenshots'];

/** GitHub's heading slug: lower case, punctuation removed, spaces to hyphens. */
export function slug(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/g, '')
    .replace(/[^\p{L}\p{N} -]/gu, '')
    .trim()
    .replace(/ /g, '-');
}

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const htmlPath = (md) => md.replace(/\.md$/, '.html');

function page(title, body, depth) {
  const home = '../'.repeat(depth) || './';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escape(title === 'WSC Talent Pool' ? title : `${title} · WSC Talent Pool`)}</title>
<link rel="icon" type="image/png" sizes="32x32" href="${home}../favicon-32.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap" rel="stylesheet" />
<style>
  :root { color-scheme: light; --text: #1c1c1a; --muted: #6b6b66; --line: #e6e6e1; --code: #f4f4f0; --link: #1f4fd8; }
  body { margin: 0; background: #fff; color: var(--text); font: 16px/1.6 Geist, system-ui, sans-serif; -webkit-text-size-adjust: 100%; }
  .wrap { max-width: 780px; margin: 0 auto; padding: 24px 16px 64px; }
  .top { display: flex; justify-content: space-between; gap: 16px; font-size: 14px; color: var(--muted); margin-bottom: 32px; }
  .top a { color: inherit; text-decoration: none; }
  .top a:hover { color: var(--text); }
  a { color: var(--link); text-decoration: none; }
  a:hover { text-decoration: underline; }
  h1 { font-size: 30px; line-height: 1.2; letter-spacing: -0.02em; margin: 0 0 20px; }
  h2 { font-size: 22px; line-height: 1.3; letter-spacing: -0.01em; margin: 40px 0 12px; }
  h3 { font-size: 17px; margin: 28px 0 8px; }
  h4 { font-size: 16px; margin: 20px 0 6px; }
  p, ul, ol { margin: 0 0 14px; }
  li { margin: 4px 0; }
  code { font: 13.5px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--code); padding: 1px 5px; border-radius: 4px; }
  pre { background: var(--code); padding: 12px 14px; border-radius: 6px; overflow-x: auto; margin: 0 0 16px; }
  pre code { background: none; padding: 0; }
  table { border-collapse: collapse; width: 100%; margin: 0 0 16px; font-size: 15px; display: block; overflow-x: auto; }
  th, td { text-align: left; vertical-align: top; padding: 8px 12px 8px 0; border-bottom: 1px solid var(--line); }
  th { font-weight: 600; }
  img { max-width: 100%; height: auto; border: 1px solid var(--line); border-radius: 6px; margin: 4px 0 8px; }
  blockquote { margin: 0 0 14px; padding-left: 14px; border-left: 3px solid var(--line); color: var(--muted); }
  hr { border: 0; border-top: 1px solid var(--line); margin: 32px 0; }
</style>
</head>
<body>
<div class="wrap">
<nav class="top"><a href="/">← WSC Talent Pool</a><a href="${home}README.html">All documents</a></nav>
${body}
</div>
</body>
</html>
`;
}

export function build(out = OUT) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const pages = new Set(PAGES.map(htmlPath));
  const files = new Set([...pages, ...COPIED.filter((c) => !c.includes('screenshots'))]);
  for (const f of readdirSync(join(ROOT, 'docs/screenshots'))) files.add(`docs/screenshots/${f}`);
  const anchors = new Map(); // page path → Set of heading ids
  const links = []; // [from page, target page, anchor]

  const rendered = PAGES.map((md) => {
    const dir = posix.dirname(md);
    const ids = new Set();
    let title = md;
    const marked = new Marked({ gfm: true });
    marked.use({
      renderer: {
        heading({ tokens, depth }) {
          const text = this.parser.parseInline(tokens);
          let id = slug(text);
          for (let n = 1; ids.has(id); n++) id = `${slug(text)}-${n}`;
          ids.add(id);
          if (depth === 1 && title === md) title = text.replace(/<[^>]+>/g, '');
          return `<h${depth} id="${id}">${text}</h${depth}>\n`;
        },
        link({ href, title: t, tokens }) {
          const text = this.parser.parseInline(tokens);
          if (/^(https?:|mailto:)/.test(href)) {
            return `<a href="${escape(href)}"${t ? ` title="${escape(t)}"` : ''} target="_blank" rel="noreferrer">${text}</a>`;
          }
          const [path, anchor = ''] = href.split('#');
          if (!path) {
            links.push([md, md, anchor]);
            return `<a href="#${escape(anchor)}">${text}</a>`;
          }
          const target = posix.normalize(posix.join(dir, path));
          if (!files.has(htmlPath(target))) return text; // a source file or data folder: no page for it
          links.push([md, htmlPath(target), anchor]);
          return `<a href="${escape(htmlPath(path))}${anchor ? `#${escape(anchor)}` : ''}">${text}</a>`;
        },
        image({ href, text }) {
          const target = posix.normalize(posix.join(dir, href));
          if (!files.has(target)) throw new Error(`${md}: image not found: ${href}`);
          return `<img src="${escape(href)}" alt="${escape(text)}" loading="lazy" />`;
        },
      },
    });
    const body = marked.parse(readFileSync(join(ROOT, md), 'utf8'));
    anchors.set(htmlPath(md), ids);
    return { md, title, body, depth: dir === '.' ? 0 : dir.split('/').length };
  });

  const missing = links.filter(([, target, anchor]) => anchor && !anchors.get(htmlPath(target))?.has(anchor));
  if (missing.length) {
    throw new Error(`Links to headings that do not exist:\n${missing.map(([f, t, a]) => `  ${f} → ${t}#${a}`).join('\n')}`);
  }

  for (const { md, title, body, depth } of rendered) {
    const file = join(out, htmlPath(md));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, page(title, body, depth));
  }
  for (const c of COPIED) cpSync(join(ROOT, c), join(out, c), { recursive: true });
  return { pages: rendered.length, links: links.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { pages, links } = build();
  console.log(`docs: ${pages} pages, ${links} links checked → ${relative(ROOT, OUT)}`);
}
