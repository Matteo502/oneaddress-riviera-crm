"use client";

import {
  getCRMNavigationItem,
  mobileMoreTabs,
  mobilePrimaryTabs,
  type CRMTab
} from "./crmNavigation";

type Props = {
  activeTab: CRMTab;
  badgeCounts: Partial<Record<CRMTab, number>>;
  moreOpen: boolean;
  onNavigate: (tab: CRMTab) => void;
  onOpenMore: () => void;
};

function MobileNavigationButton({
  tab,
  active,
  badge,
  onClick
}: {
  tab: CRMTab;
  active: boolean;
  badge?: number;
  onClick: () => void;
}) {
  const item = getCRMNavigationItem(tab);

  return (
    <button
      type="button"
      className={`mobile-crm-nav-button ${active ? "is-active" : ""}`}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      <span className="mobile-crm-nav-icon" aria-hidden="true">{item.icon}</span>
      <span>{item.label}</span>
      {badge ? <span className="mobile-crm-nav-badge" aria-label={`${badge} élément(s) à traiter`}>{badge}</span> : null}
    </button>
  );
}

export default function MobileCRMNavigation({
  activeTab,
  badgeCounts,
  moreOpen,
  onNavigate,
  onOpenMore
}: Props) {
  const moreBadge = mobileMoreTabs.reduce((total, tab) => total + (badgeCounts[tab] ?? 0), 0);
  const moreActive = moreOpen || mobileMoreTabs.includes(activeTab);

  return (
    <nav className="mobile-crm-navigation" aria-label="Navigation mobile principale">
      {mobilePrimaryTabs.map((tab) => (
        <MobileNavigationButton
          key={tab}
          tab={tab}
          active={activeTab === tab && !moreOpen}
          badge={badgeCounts[tab]}
          onClick={() => onNavigate(tab)}
        />
      ))}

      <button
        type="button"
        className={`mobile-crm-nav-button ${moreActive ? "is-active" : ""}`}
        aria-expanded={moreOpen}
        aria-controls="mobile-more-menu"
        onClick={onOpenMore}
      >
        <span className="mobile-crm-nav-icon" aria-hidden="true">•••</span>
        <span>Plus</span>
        {moreBadge ? <span className="mobile-crm-nav-badge" aria-label={`${moreBadge} élément(s) à traiter`}>{moreBadge}</span> : null}
      </button>
    </nav>
  );
}
