"use client";

import { useEffect, useState } from "react";

type CRMTheme = "light" | "dark";

const THEME_STORAGE_KEY = "oneaddress-riviera-crm-theme-v1";

function applyTheme(theme: CRMTheme) {
  document.documentElement.dataset.crmTheme = theme;
  document.documentElement.style.colorScheme = theme;
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<CRMTheme>("dark");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    const initialTheme: CRMTheme = savedTheme === "light" ? "light" : "dark";

    setTheme(initialTheme);
    applyTheme(initialTheme);
  }, []);

  function toggleTheme() {
    const nextTheme: CRMTheme = theme === "dark" ? "light" : "dark";

    setTheme(nextTheme);
    applyTheme(nextTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  }

  const darkModeEnabled = theme === "dark";

  return (
    <>
      <button
        type="button"
        className="crm-theme-toggle"
        onClick={toggleTheme}
        aria-pressed={darkModeEnabled}
        aria-label={darkModeEnabled ? "Activer le mode clair" : "Activer le mode nuit"}
        title={darkModeEnabled ? "Passer en mode clair" : "Passer en mode nuit"}
      >
        <span aria-hidden="true">{darkModeEnabled ? "☀" : "☾"}</span>
        <strong>{darkModeEnabled ? "Mode clair" : "Mode nuit"}</strong>
      </button>

      <style jsx global>{`
        [data-crm-theme="dark"] {
          --bg: #090a0c;
          --bg-2: #0d0f12;
          --panel: #121417;
          --panel-soft: rgba(18, 20, 23, 0.97);
          --text: #d2d1cc;
          --muted: #8d9194;
          --border: #2b2e32;
          --green: #202327;
          --green-2: #191c20;
          --green-3: #24282d;
          --gold: #a99a78;
          --gold-2: #b8aa8b;
          --danger: #a58f8c;
          --success: #909993;
          --shadow: 0 16px 46px rgba(0, 0, 0, 0.32);
        }

        [data-crm-theme="dark"],
        [data-crm-theme="dark"] body {
          color-scheme: dark;
          color: var(--text);
          background: #090a0c !important;
        }

        [data-crm-theme="dark"] body {
          scrollbar-color: #35383c #0b0c0e;
        }

        [data-crm-theme="dark"] .crm-shell {
          background: #090a0c !important;
        }

        [data-crm-theme="dark"] .sidebar {
          color: #c4c3be !important;
          border-color: #272a2e !important;
          background: #0b0c0e !important;
          box-shadow: 12px 0 36px rgba(0, 0, 0, 0.28) !important;
        }

        [data-crm-theme="dark"] .sidebar :is(h1, h2, h3, strong) {
          color: #d2d1cc !important;
        }

        [data-crm-theme="dark"] .sidebar :is(.nav-button, .sidebar-card, .sidebar-card span) {
          color: #96999b !important;
        }

        [data-crm-theme="dark"] .sidebar .nav-button:hover,
        [data-crm-theme="dark"] .sidebar .nav-button.active {
          color: #d2d1cc !important;
          border-color: #34373b !important;
          background: #17191c !important;
        }

        [data-crm-theme="dark"] .sidebar .nav-button span,
        [data-crm-theme="dark"] .eyebrow {
          color: #a99a78 !important;
        }

        [data-crm-theme="dark"] .content-panel {
          color: var(--text);
          background: #0d0f12 !important;
        }

        [data-crm-theme="dark"] :is(h1, h2, h3, h4, h5, label),
        [data-crm-theme="dark"] .content-panel strong {
          color: #d2d1cc !important;
        }

        [data-crm-theme="dark"] :is(
          p,
          small,
          .muted-line,
          .card p,
          .item-card p,
          .content-panel span
        ) {
          color: #8d9194;
        }

        [data-crm-theme="dark"] :is(
          .stat-card,
          .card,
          .property-card,
          .pipeline-column,
          .item-card,
          .contact-card,
          .lead-card,
          .quote-card,
          .booking-card,
          .vendor-invoice-card,
          .form-card,
          .detail-card,
          .details-card,
          .planning-entry-card,
          .document-file-card,
          .document-folder-card,
          .house-card,
          .worker-card,
          .payment-card,
          .shared-db-status-panel,
          .crm-notification-panel,
          .notification-card,
          .mini-stat,
          .confirm-dialog,
          .quote-preview,
          .dashboard-command-card,
          .dashboard-command-row,
          .dashboard-command-kpi-tile,
          .planning-week-day,
          .planning-day
        ) {
          color: var(--text) !important;
          border-color: #2b2e32 !important;
          background: #121417 !important;
          background-image: none !important;
          box-shadow: var(--shadow);
        }

        [data-crm-theme="dark"] :is(
          .dashboard-command-card,
          .dashboard-command-row,
          .dashboard-command-kpi-tile,
          .notification-card,
          .mini-stat
        ) :is(strong, span, p, small) {
          color: inherit !important;
        }

        [data-crm-theme="dark"] :is(
          .dashboard-command-card.tone-danger,
          .dashboard-command-card.tone-warning,
          .dashboard-command-card.tone-success,
          .dashboard-command-row.tone-danger,
          .dashboard-command-row.tone-warning,
          .dashboard-command-row.tone-success
        ) {
          border-color: #36393d !important;
          background: #141619 !important;
        }

        [data-crm-theme="dark"] :is(input, select, textarea, .search-input) {
          color: #cfcec9 !important;
          border-color: #303338 !important;
          background: #0d0f12 !important;
          background-image: none !important;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.025) !important;
        }

        [data-crm-theme="dark"] :is(input, textarea, .search-input)::placeholder {
          color: #656a6e !important;
        }

        [data-crm-theme="dark"] select {
          color-scheme: dark;
        }

        [data-crm-theme="dark"] :is(table, th, td) {
          color: #c6c6c1 !important;
          border-color: #292c30 !important;
        }

        [data-crm-theme="dark"] :is(thead, th) {
          background: #17191c !important;
          background-image: none !important;
        }

        [data-crm-theme="dark"] tbody tr {
          background: #111316 !important;
        }

        [data-crm-theme="dark"] tbody tr:nth-child(even) {
          background: #131518 !important;
        }

        [data-crm-theme="dark"] tbody tr:hover {
          background: #1a1d20 !important;
        }

        [data-crm-theme="dark"] :is(
          button,
          .primary-button,
          .secondary-button,
          .ghost-button,
          .icon-button,
          .compact-button
        ):not(.nav-button):not(.crm-theme-toggle):not(.danger-link) {
          color: #c9c8c3 !important;
          border-color: #36393e !important;
          background: #1a1d20 !important;
          background-image: none !important;
          box-shadow: none !important;
        }

        [data-crm-theme="dark"] :is(
          button,
          .primary-button,
          .secondary-button,
          .ghost-button,
          .icon-button,
          .compact-button
        ):not(.nav-button):not(.crm-theme-toggle):not(.danger-link):hover {
          color: #dcdbd6 !important;
          border-color: #484c51 !important;
          background: #23262a !important;
        }

        [data-crm-theme="dark"] :is(
          .badge,
          .status-pill,
          .lead-status,
          .quote-status,
          [class*="status-"],
          [class*="semantic-"]
        ) {
          color: #b8b8b3 !important;
          border-color: #34373b !important;
          background: #181a1d !important;
          background-image: none !important;
          box-shadow: none !important;
        }

        [data-crm-theme="dark"] :is(
          .planning-event-pill,
          .planning-week-event,
          .planning-event-pill.status-termine,
          .planning-event-pill.status-prevu,
          .planning-event-pill.status-en-cours,
          .planning-event-pill.status-a-confirmer
        ) {
          color: #bfc0bc !important;
          border-color: #383b40 !important;
          background: #181a1d !important;
        }

        [data-crm-theme="dark"] :is(
          .crm-topbar-menu-panel,
          .dropdown-menu,
          [role="menu"]
        ) {
          color: #c9c8c3 !important;
          border-color: #303338 !important;
          background: #111316 !important;
          background-image: none !important;
          box-shadow: 0 20px 46px rgba(0, 0, 0, 0.5) !important;
        }

        [data-crm-theme="dark"] .crm-topbar-menu-panel button {
          color: #c9c8c3 !important;
        }

        [data-crm-theme="dark"] :is(a, .link-button) {
          color: #afa17f;
        }

        [data-crm-theme="dark"] .danger-link {
          color: #a58f8c !important;
        }

        [data-crm-theme="dark"] .confirm-backdrop {
          background: rgba(0, 0, 0, 0.82) !important;
        }

        [data-crm-theme="dark"] :is(
          .recharts-wrapper,
          .recharts-surface,
          .chart-container
        ) {
          filter: grayscale(0.9) saturate(0.25) brightness(0.82);
        }

        [data-crm-theme="dark"] ::selection {
          color: #d2d1cc;
          background: #3b3932;
        }

        .crm-theme-toggle {
          position: fixed;
          right: 22px;
          bottom: 22px;
          z-index: 10000;
          display: inline-flex;
          align-items: center;
          gap: 9px;
          min-height: 44px;
          padding: 10px 15px;
          border: 1px solid #3a3d41;
          border-radius: 999px;
          color: #c9c8c3;
          background: #181a1d;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.38);
          transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
        }

        .crm-theme-toggle:hover {
          transform: translateY(-1px);
          color: #d8d7d2;
          border-color: #50545a;
          background: #222529;
        }

        .crm-theme-toggle:focus-visible {
          outline: 2px solid #84795f;
          outline-offset: 3px;
        }

        .crm-theme-toggle span {
          color: #a99a78;
          font-size: 1.05rem;
          line-height: 1;
        }

        .crm-theme-toggle strong {
          color: inherit;
          font-size: 0.78rem;
          letter-spacing: 0.04em;
        }

        [data-crm-theme="light"] .crm-theme-toggle {
          color: #fffaf2;
          border-color: rgba(211, 177, 110, 0.46);
          background: linear-gradient(135deg, #173f36, #09271f);
        }

        @media (max-width: 720px) {
          .crm-theme-toggle {
            right: 14px;
            bottom: 14px;
            min-width: 44px;
            padding: 11px 13px;
          }

          .crm-theme-toggle strong {
            display: none;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .crm-theme-toggle {
            transition: none;
          }
        }
      `}</style>
    </>
  );
}
