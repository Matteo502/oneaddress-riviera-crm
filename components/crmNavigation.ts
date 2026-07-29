export type CRMTab =
  | "dashboard"
  | "contacts"
  | "leads"
  | "tasks"
  | "quotes"
  | "bookings"
  | "vendorQuotes"
  | "vendorInvoices"
  | "houseTracking"
  | "planning"
  | "properties"
  | "vehicles"
  | "boats"
  | "documents";

export type CRMNavigationItem = {
  tab: CRMTab;
  label: string;
  shortLabel?: string;
  icon: string;
};

export const crmNavigationItems: CRMNavigationItem[] = [
  { tab: "dashboard", label: "Dashboard", icon: "⌂" },
  { tab: "contacts", label: "Contacts", icon: "◉" },
  { tab: "leads", label: "Leads", icon: "◎" },
  { tab: "tasks", label: "Tâches", icon: "✓" },
  { tab: "quotes", label: "Devis", icon: "▤" },
  { tab: "bookings", label: "Réservations", icon: "◆" },
  { tab: "vendorQuotes", label: "Devis prestataires", shortLabel: "Devis presta.", icon: "◇" },
  { tab: "vendorInvoices", label: "Factures prestataires", shortLabel: "Factures presta.", icon: "€" },
  { tab: "houseTracking", label: "Suivi maison", icon: "◷" },
  { tab: "documents", label: "Documents", icon: "▣" },
  { tab: "planning", label: "Planning", icon: "▦" },
  { tab: "properties", label: "Biens", icon: "⌂" },
  { tab: "vehicles", label: "Voitures", icon: "◇" },
  { tab: "boats", label: "Bateaux", icon: "≈" }
];

export const mobilePrimaryTabs: CRMTab[] = ["dashboard", "contacts", "leads", "tasks"];
export const mobileMoreTabs: CRMTab[] = crmNavigationItems
  .map((item) => item.tab)
  .filter((tab) => !mobilePrimaryTabs.includes(tab));

export function getCRMNavigationItem(tab: CRMTab) {
  return crmNavigationItems.find((item) => item.tab === tab) ?? crmNavigationItems[0];
}

export function getCRMTabTitle(tab: CRMTab) {
  const titles: Record<CRMTab, string> = {
    dashboard: "Vue d’ensemble",
    contacts: "Contacts",
    leads: "Pipeline leads",
    tasks: "Tâches",
    quotes: "Devis",
    bookings: "Réservations",
    vendorQuotes: "Devis prestataires",
    vendorInvoices: "Factures prestataires",
    houseTracking: "Suivi maison",
    documents: "Documents",
    planning: "Planning",
    properties: "Biens",
    vehicles: "Voitures",
    boats: "Bateaux"
  };

  return titles[tab];
}
