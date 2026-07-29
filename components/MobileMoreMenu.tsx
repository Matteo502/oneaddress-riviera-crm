"use client";

import { useEffect, useRef } from "react";
import {
  getCRMNavigationItem,
  mobileMoreTabs,
  type CRMTab
} from "./crmNavigation";

export type MobileSecondaryAction = {
  label: string;
  onClick: () => void;
  tone?: "default" | "danger";
};

type Props = {
  activeTab: CRMTab;
  badgeCounts: Partial<Record<CRMTab, number>>;
  open: boolean;
  sessionEmail: string;
  secondaryActions: MobileSecondaryAction[];
  onClose: () => void;
  onNavigate: (tab: CRMTab) => void;
};

export default function MobileMoreMenu({
  activeTab,
  badgeCounts,
  open,
  sessionEmail,
  secondaryActions,
  onClose,
  onNavigate
}: Props) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="mobile-sheet-backdrop" onMouseDown={onClose}>
      <section
        id="mobile-more-menu"
        className="mobile-more-menu"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-more-menu-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="mobile-sheet-header">
          <div>
            <p className="eyebrow">Navigation</p>
            <h2 id="mobile-more-menu-title">Plus de modules</h2>
          </div>
          <button ref={closeButtonRef} type="button" className="mobile-icon-button" aria-label="Fermer le menu" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="mobile-more-menu-scroll">
          <div className="mobile-more-grid">
            {mobileMoreTabs.map((tab) => {
              const item = getCRMNavigationItem(tab);
              const badge = badgeCounts[tab] ?? 0;

              return (
                <button
                  key={tab}
                  type="button"
                  className={`mobile-more-item ${activeTab === tab ? "is-active" : ""}`}
                  aria-current={activeTab === tab ? "page" : undefined}
                  onClick={() => {
                    onNavigate(tab);
                    onClose();
                  }}
                >
                  <span className="mobile-more-item-icon" aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                  {badge ? <strong aria-label={`${badge} élément(s) à traiter`}>{badge}</strong> : null}
                </button>
              );
            })}
          </div>

          <section className="mobile-more-secondary" aria-label="Actions secondaires">
            <p className="mobile-session-line">Connecté : <strong>{sessionEmail}</strong></p>
            {secondaryActions.map((action) => (
              <button
                key={action.label}
                type="button"
                className={action.tone === "danger" ? "is-danger" : ""}
                onClick={() => {
                  action.onClick();
                  onClose();
                }}
              >
                {action.label}
              </button>
            ))}
          </section>
        </div>
      </section>
    </div>
  );
}
