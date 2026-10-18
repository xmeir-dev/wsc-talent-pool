/** A stand-in for the host's top navigation: enough to place the screen, nothing that works. */
export function HubSpotNav() {
  return (
    <nav className="hs-nav" aria-label="HubSpot (simulated)">
      <span className="hs-brand">HubSpot</span>
      <span className="hs-search" aria-hidden="true">
        Search HubSpot
      </span>
      <span className="hs-nav-item is-active">Contacts</span>
    </nav>
  );
}
