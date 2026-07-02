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
          --bg: #06131b;
          --bg-2: #0a1c25;
          --panel: #0d222b;
          --panel-soft: rgba(14, 34, 43, 0.94);
          --text: #f3eee4;
          --muted: #aab6b8;
          --border: rgba(211, 177, 110, 0.26);
          --green: #8dc1b2;
          --green-2: #173f36;
          --green-3: #24594c;
          --gold: #d3b16e;
          --gold-2: #ead4a4;
          --danger: #ef8f80;
          --success: #7fc49e;
          --shadow: 0 22px 70px rgba(0, 0, 0, 0.36);
        }

        [data-crm-theme="dark"] body {
          color: var(--text);
          background:
            radial-gradient(circle at 18% 0%, rgba(211, 177, 110, 0.13), transparent 34rem),
            radial-gradient(circle at 82% 10%, rgba(47, 105, 111, 0.18), transparent 32rem),
            linear-gradient(135deg, #041019 0%, var(--bg) 48%, var(--bg-2) 100%);
        }

        [data-crm-theme="dark"] .content-panel {
          color: var(--text);
        }

        [data-crm-theme="dark"] :is(h1, h2, h3, h4, label),
        [data-crm-theme="dark"] .content-panel strong {
          color: var(--text);
        }

        [data-crm-theme="dark"] :is(.muted-line, .card p, .item-card p, .content-panel small) {
          color: var(--muted);
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
          .shared-db-status-panel,
          .crm-notification-panel,
          .confirm-dialog,
          .dashboard-command-card
        ) {
          color: var(--text);
          border-color: var(--border) !important;
          background: linear-gradient(180deg, rgba(15, 36, 46, 0.98), rgba(9, 27, 36, 0.96)) !important;
          box-shadow: var(--shadow);
        }

        [data-crm-theme="dark"] :is(
          .dashboard-command-row,
          .dashboard-command-kpi-tile,
          .notification-card,
          .mini-stat,
          .planning-week-day,
          .planning-day,
          .quote-preview,
          .sidebar-card
        ) {
          color: var(--text) !important;
          border-color: var(--border) !important;
          background: rgba(18, 42, 52, 0.92) !important;
        }

        [data-crm-theme="dark"] .dashboard-command-center :is(
          .dashboard-command-row,
          .dashboard-command-kpi-tile
        ) :is(strong, span) {
          color: var(--text) !important;
        }

        [data-crm-theme="dark"] :is(input, select, textarea, .search-input) {
          color: var(--text);
          border-color: var(--border);
          background: #0b2029 !important;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
        }

        [data-crm-theme="dark"] :is(input, textarea, .search-input)::placeholder {
          color: rgba(214, 222, 222, 0.48);
        }

        [data-crm-theme="dark"] select {
          color-scheme: dark;
        }

        [data-crm-theme="dark"] :is(table, th, td) {
          color: var(--text);
          border-color: var(--border) !important;
        }

        [data-crm-theme="dark"] thead,
        [data-crm-theme="dark"] th {
          background: rgba(211, 177, 110, 0.10) !important;
        }

        [data-crm-theme="dark"] tbody tr {
          background: rgba(10, 29, 38, 0.72);
        }

        [data-crm-theme="dark"] tbody tr:hover {
          background: rgba(211, 177, 110, 0.08) !important;
        }

        [data-crm-theme="dark"] :is(.ghost-button, .icon-button) {
          color: var(--gold-2);
          background: rgba(211, 177, 110, 0.12);
        }

        [data-crm-theme="dark"] .secondary-button {
          color: #122027;
        }

        [data-crm-theme="dark"] :is(.crm-topbar-menu-panel, .dropdown-menu, [role="menu"]) {
          color: var(--text);
          border-color: var(--border) !important;
          background: #0b2029 !important;
          box-shadow: 0 24px 58px rgba(0, 0, 0, 0.46) !important;
        }

        [data-crm-theme="dark"] .crm-topbar-menu-panel button {
          color: var(--text);
        }

        [data-crm-theme="dark"] :is(
          .dashboard-command-card.tone-danger,
          .dashboard-command-row.tone-danger
        ) {
          border-color: rgba(239, 143, 128, 0.34) !important;
          background: rgba(92, 35, 35, 0.42) !important;
        }

        [data-crm-theme="dark"] :is(
          .dashboard-command-card.tone-warning,
          .dashboard-command-row.tone-warning
        ) {
          border-color: rgba(211, 177, 110, 0.38) !important;
          background: rgba(88, 68, 29, 0.38) !important;
        }

        [data-crm-theme="dark"] :is(
          .dashboard-command-card.tone-success,
          .dashboard-command-row.tone-success
        ) {
          border-color: rgba(127, 196, 158, 0.30) !important;
          background: rgba(31, 77, 57, 0.38) !important;
        }

        [data-crm-theme="dark"] .planning-event-pill.status-termine {
          color: #a9e2bd !important;
          background: rgba(47, 125, 74, 0.28) !important;
        }

        [data-crm-theme="dark"] .planning-event-pill.status-prevu {
          color: #ffb1a8 !important;
          background: rgba(157, 59, 59, 0.26) !important;
        }

        [data-crm-theme="dark"] :is(
          .planning-event-pill.status-en-cours,
          .planning-event-pill.status-a-confirmer
        ) {
          color: #f1d895 !important;
          background: rgba(214, 166, 61, 0.24) !important;
        }

        [data-crm-theme="dark"] .confirm-backdrop {
          background: rgba(1, 8, 12, 0.78);
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
          border: 1px solid rgba(211, 177, 110, 0.46);
          border-radius: 999px;
          color: #fffaf2;
          background: linear-gradient(135deg, #173f36, #09271f);
          box-shadow: 0 14px 36px rgba(0, 0, 0, 0.28);
          transition: transform 160ms ease, box-shadow 160ms ease, filter 160ms ease;
        }

        .crm-theme-toggle:hover {
          transform: translateY(-2px);
          filter: brightness(1.08);
          box-shadow: 0 18px 42px rgba(0, 0, 0, 0.34);
        }

        .crm-theme-toggle:focus-visible {
          outline: 3px solid rgba(211, 177, 110, 0.48);
          outline-offset: 3px;
        }

        .crm-theme-toggle span {
          color: var(--gold-2);
          font-size: 1.1rem;
          line-height: 1;
        }

        .crm-theme-toggle strong {
          color: inherit;
          font-size: 0.78rem;
          letter-spacing: 0.04em;
        }

        [data-crm-theme="light"] .crm-theme-toggle {
          color: #fffaf2;
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
