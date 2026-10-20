/** The sign-off under every page (list and profile), full width below the content column. */
const REPO = 'https://github.com/xmeir-dev/wsc-talent-pool/blob/main';

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
        <span>WSC Sports, Oct 18–19, 2026</span>
      </span>
      <nav className="page-foot-docs" aria-label="Project documents">
        <a href={`${REPO}/README.md`} target="_blank" rel="noreferrer">
          README
        </a>
        <a href={`${REPO}/docs/assumptions.md`} target="_blank" rel="noreferrer">
          Assumptions
        </a>
        <a href={`${REPO}/docs/design.md`} target="_blank" rel="noreferrer">
          Design
        </a>
        <a href="https://wsc-talent-pool-demo.vercel.app/" target="_blank" rel="noreferrer">
          Production preview
        </a>
      </nav>
    </footer>
  );
}
