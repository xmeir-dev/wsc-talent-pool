/** The W from the WSC Sports logo (wsc-sports.com logo_header.svg): two strokes in the current text colour and the lime accent. */
export function WscMark({ size = 14 }: { size?: number }) {
  // The W is wider than tall: fill the icon height with a wider box so it reads at icon size.
  return (
    <svg width={Math.round((size * 34.6) / 20)} height={size} viewBox="0 0.5 34.6 20" aria-hidden="true">
      <path fill="currentColor" d="M17.1954 14.7883L8.97328 0.5H0L11.5008 20.5H17.1929V14.7883H17.1954Z" />
      <path fill="currentColor" d="M29.0001 14.7883L20.7805 0.5H11.8047L23.3055 20.5H29.0001V14.7883Z" />
      <path fill="#D0F200" d="M31.743 3.82569L28.8983 3.84097V10.3981L34.5903 0.5H23.2012" />
    </svg>
  );
}
