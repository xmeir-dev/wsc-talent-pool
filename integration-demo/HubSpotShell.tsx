import {
  ChartLineData01Icon,
  ContactIcon,
  CustomerService01Icon,
  HelpCircleIcon,
  Home01Icon,
  Megaphone01Icon,
  Notification03Icon,
  Search01Icon,
  Settings01Icon,
  ShoppingBag01Icon,
} from '@hugeicons/core-free-icons';
import { Icon } from './Icon';

/**
 * HubSpot's frame: dark top bar with global search and a left icon rail. Decorative only;
 * nothing in it is wired, so it is hidden from assistive technology.
 */
export function HubSpotShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="host hs">
      <header className="hs-top" aria-hidden="true">
        <span className="hs-brand">HubSpot</span>
        <span className="hs-search">
          <Icon icon={Search01Icon} size={16} />
          Search HubSpot
        </span>
        <span className="hs-top-icons">
          <Icon icon={HelpCircleIcon} />
          <Icon icon={Settings01Icon} />
          <Icon icon={Notification03Icon} />
          <span className="hs-me">WS</span>
        </span>
      </header>
      <div className="hs-frame">
        <nav className="hs-rail" aria-hidden="true">
          <span>
            <Icon icon={Home01Icon} />
          </span>
          <span className="is-active">
            <Icon icon={ContactIcon} />
          </span>
          <span>
            <Icon icon={Megaphone01Icon} />
          </span>
          <span>
            <Icon icon={ShoppingBag01Icon} />
          </span>
          <span>
            <Icon icon={CustomerService01Icon} />
          </span>
          <span>
            <Icon icon={ChartLineData01Icon} />
          </span>
        </nav>
        <div className="hs-main">{children}</div>
      </div>
    </div>
  );
}
