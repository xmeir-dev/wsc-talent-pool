/**
 * The W from the WSC Sports logo (wsc-sports.com logo_header.svg), all in the current text colour.
 * Drawn in a square box the size of our other icons; being wide and short, it spans the box's full width so it reads the same size.
 */
export function WscMark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 -6.8 34.6 34.6" aria-hidden="true">
      <path fill="currentColor" d="M17.1954 14.7883L8.97328 0.5H0L11.5008 20.5H17.1929V14.7883H17.1954Z" />
      <path fill="currentColor" d="M29.0001 14.7883L20.7805 0.5H11.8047L23.3055 20.5H29.0001V14.7883Z" />
      <path fill="currentColor" d="M31.743 3.82569L28.8983 3.84097V10.3981L34.5903 0.5H23.2012" />
    </svg>
  );
}
