/** The sign-off under every page (list and profile), full width below the content column. */
const DOCS = '/project'; // the repository's documents, published with the view (see scripts/build-docs.mjs)

export function PageFooter() {
  return (
    <footer className="page-foot">
      <span className="page-foot-made">
        <span>
          Made by{' '}
          <a href="https://www.linkedin.com/in/meir-rosenschein" target="_blank" rel="noreferrer">
            Meir Rosenschein
          </a>{' '}
          for
        </span>
        <img src="/favicon-192.png" alt="" width={16} height={16} />
        <span>WSC Sports, Oct 18–20, 2026</span>
      </span>
      <nav className="page-foot-docs" aria-label="Project documents">
        <a href={`${DOCS}/README.html`} target="_blank" rel="noreferrer">
          README
        </a>
        <a href={`${DOCS}/docs/assumptions.html`} target="_blank" rel="noreferrer">
          Assumptions
        </a>
        <a href={`${DOCS}/docs/design.html`} target="_blank" rel="noreferrer">
          Design
        </a>
        <a href="https://wsc-talent-pool-demo.vercel.app/" target="_blank" rel="noreferrer">
          Production preview
        </a>
      </nav>
    </footer>
  );
}
