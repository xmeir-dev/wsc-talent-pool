/** The sign-off under every page (list and profile), full width below the content column. */
export function PageFooter() {
  return (
    <footer className="page-foot">
      <span>
        Made by{' '}
        <a href="https://www.linkedin.com/in/meir-rosenschein" target="_blank" rel="noreferrer">
          Meir Rosenschein
        </a>{' '}
        for
      </span>
      <img src="/favicon-192.png" alt="" width={16} height={16} />
      <span>WSC Sports, Oct 18–20, 2026</span>
      <span aria-hidden="true">·</span>
      <a href="https://wsc-talent-pool-demo.vercel.app/" target="_blank" rel="noreferrer">
        Production preview
      </a>
    </footer>
  );
}
