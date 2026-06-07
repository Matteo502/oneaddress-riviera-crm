"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type {
  CRMData,
  Contact,
  ContactKind,
  Lead,
  LeadStatus,
  Property,
  PropertyStatus,
  Vehicle,
  VehicleStatus,
  Boat,
  BoatStatus,
  Task,
  TaskStatus
} from "@/lib/types";

const STORAGE_KEY = "oneaddress-riviera-crm-v1";
const QUOTES_STORAGE_KEY = "oneaddress-riviera-crm-quotes-v1";
const leadStatuses: LeadStatus[] = ["Nouveau", "Contacté", "Devis", "Négociation", "Gagné", "Perdu"];
const propertyStatuses: PropertyStatus[] = ["Disponible", "Mandat en cours", "Loué", "Vendu"];
const vehicleStatuses: VehicleStatus[] = ["Disponible", "En location", "En maintenance", "Vendu"];
const boatStatuses: BoatStatus[] = ["Disponible", "En charter", "En maintenance", "Vendu"];
const taskStatuses: TaskStatus[] = ["À faire", "En cours", "Terminé"];
const contactKinds: ContactKind[] = ["Client", "Propriétaire", "Partenaire"];
const contactLevels = ["Standard", "VIP", "Ultra VIP"] as const;
const contactLanguages = ["Français", "Anglais", "Italien", "Autre"] as const;
const contactRelationshipStatuses = ["Prospect", "Actif", "Dormant"] as const;

const emptyData: CRMData = {
  contacts: [],
  leads: [],
  properties: [],
  vehicles: [],
  boats: [],
  tasks: []
};

type Tab = "dashboard" | "contacts" | "leads" | "tasks" | "quotes" | "planning" | "properties" | "vehicles" | "boats";

type Toast = {
  message: string;
  tone: "success" | "warning";
};

const currency = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0
});

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now()}`;
}

function safeNumber(value: FormDataEntryValue | null) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}



function isOpenLead(lead: Lead) {
  return lead.status !== "Gagné" && lead.status !== "Perdu";
}

function getDueStatus(value?: string) {
  if (!value) return "none";

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const date = new Date(`${value}T00:00:00`);
  date.setHours(0, 0, 0, 0);

  if (date.getTime() < today.getTime()) return "overdue";
  if (date.getTime() === today.getTime()) return "today";

  return "future";
}

function getDueLabel(value?: string) {
  const status = getDueStatus(value);

  if (!value) return "Échéance non renseignée";
  if (status === "overdue") return `En retard · ${formatDateFR(value)}`;
  if (status === "today") return `Aujourd'hui · ${formatDateFR(value)}`;

  return `Échéance ${formatDateFR(value)}`;
}

function priorityWeight(priority?: string) {
  if (priority === "Haute") return 0;
  if (priority === "Moyenne") return 1;
  return 2;
}

function sortByUrgency<T extends { dueDate: string; priority?: string; value?: number }>(items: T[]) {
  return [...items].sort((a, b) => {
    const statusA = getDueStatus(a.dueDate);
    const statusB = getDueStatus(b.dueDate);

    const statusWeight = {
      overdue: 0,
      today: 1,
      future: 2,
      none: 3
    };

    const statusDiff = statusWeight[statusA] - statusWeight[statusB];
    if (statusDiff !== 0) return statusDiff;

    const dateA = a.dueDate ? new Date(`${a.dueDate}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER;
    const dateB = b.dueDate ? new Date(`${b.dueDate}T00:00:00`).getTime() : Number.MAX_SAFE_INTEGER;

    if (dateA !== dateB) return dateA - dateB;

    const priorityDiff = priorityWeight(a.priority) - priorityWeight(b.priority);
    if (priorityDiff !== 0) return priorityDiff;

    

  return (b.value ?? 0) - (a.value ?? 0);
  });
}

function formatDateFR(value?: string) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function formatReservationPeriod(start?: string, end?: string) {
  if (start && end) return `Réservation du ${formatDateFR(start)} au ${formatDateFR(end)}`;
  if (start) return `Réservation à partir du ${formatDateFR(start)}`;
  if (end) return `Réservation jusqu'au ${formatDateFR(end)}`;
  return "Dates de réservation non renseignées";
}


function getContactClientLevel(contact: Contact) {
  return contact.clientLevel || "Standard";
}

function getContactPreferredLanguage(contact: Contact) {
  return contact.preferredLanguage || "Français";
}

function getContactRelationshipStatus(contact: Contact) {
  return contact.relationshipStatus || "Prospect";
}



function csvEscape(value: unknown) {
  const stringValue = String(value ?? "");
  const escaped = stringValue.replace(/"/g, '""');

  if (escaped.includes(",") || escaped.includes("\n") || escaped.includes('"')) {
    return `"${escaped}"`;
  }

  return escaped;
}

function toCsv(headers: string[], rows: unknown[][]) {
  return [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(","))
  ].join("\n");
}

function downloadTextFile(filename: string, content: string, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
}

function exportCRMAsCsv(data: CRMData) {
  const sections = [
    {
      title: "CONTACTS",
      headers: ["Nom", "Type", "Niveau client", "Langue", "Relation", "Email", "Téléphone", "Ville", "Adresse postale", "Budget", "Source", "Préférences", "Notes importantes", "Notes"],
      rows: data.contacts.map((contact) => [
        contact.name,
        contact.kind,
        getContactClientLevel(contact),
        getContactPreferredLanguage(contact),
        getContactRelationshipStatus(contact),
        contact.email,
        contact.phone,
        contact.city,
        contact.postalAddress,
        contact.budget,
        contact.source,
        contact.preferences ?? "",
        contact.importantNotes ?? "",
        contact.notes
      ])
    },
    {
      title: "LEADS",
      headers: ["Catégorie", "Contact", "Statut", "Valeur", "Priorité", "Échéance réponse", "Début réservation", "Fin réservation", "Prochaine action", "Notes"],
      rows: data.leads.map((lead) => [
        lead.category,
        lead.contactName,
        lead.status,
        lead.value,
        lead.priority,
        lead.dueDate,
        lead.rentalStartDate,
        lead.rentalEndDate,
        lead.nextAction,
        lead.notes ?? ""
      ])
    },
    {
      title: "BIENS",
      headers: ["Nom", "Ville", "Type", "Prix", "Statut", "Propriétaire", "Chambres", "Surface"],
      rows: data.properties.map((property) => [
        (property as { name?: string; title?: string }).name ?? (property as { name?: string; title?: string }).title ?? "",
        property.city,
        "type" in property ? property.type : "",
        property.price,
        property.status,
        property.owner,
        property.bedrooms,
        property.surface
      ])
    },
    {
      title: "VOITURES",
      headers: ["Nom", "Marque", "Modèle", "Ville", "Prix / jour", "Statut", "Propriétaire", "Année", "Kilométrage"],
      rows: (data.vehicles ?? []).map((vehicle) => [
        vehicle.name,
        vehicle.brand,
        vehicle.model,
        vehicle.city,
        vehicle.price,
        vehicle.status,
        vehicle.owner,
        vehicle.year,
        vehicle.mileage
      ])
    },
    {
      title: "BATEAUX",
      headers: ["Nom", "Port", "Type", "Prix / jour", "Statut", "Propriétaire", "Année", "Longueur"],
      rows: (data.boats ?? []).map((boat) => [
        boat.name,
        boat.port,
        boat.type,
        boat.price,
        boat.status,
        boat.owner,
        boat.year,
        boat.length
      ])
    },
    {
      title: "TÂCHES",
      headers: ["Titre", "Responsable", "Statut", "Échéance", "Lead lié"],
      rows: data.tasks.map((task) => [
        task.title,
        task.owner,
        task.status,
        task.dueDate,
        task.linkedTo
      ])
    }
  ];

  const content = sections
    .map((section) => [
      section.title,
      toCsv(section.headers, section.rows)
    ].join("\n"))
    .join("\n\n");

  const date = new Date().toISOString().slice(0, 10);
  downloadTextFile(`oneaddress-riviera-crm-${date}.csv`, content, "text/csv;charset=utf-8");
}



function parseAssetKey(value: FormDataEntryValue | null): {
  assetType: "" | "Property" | "Vehicle" | "Boat";
  assetId: string;
} {
  const rawValue = String(value ?? "");

  if (!rawValue.includes(":")) {
    return { assetType: "", assetId: "" };
  }

  const [rawAssetType, assetId = ""] = rawValue.split(":");

  if (rawAssetType === "Property") {
    return { assetType: "Property", assetId };
  }

  if (rawAssetType === "Vehicle") {
    return { assetType: "Vehicle", assetId };
  }

  if (rawAssetType === "Boat") {
    return { assetType: "Boat", assetId };
  }

  return { assetType: "", assetId: "" };
}

function getPropertyDisplayName(property: Property) {
  const flexibleProperty = property as Property & { name?: string; title?: string };
  return flexibleProperty.name ?? flexibleProperty.title ?? "Bien sans nom";
}

type QuoteBillingUnit = "day" | "week" | "fixed";

type QuoteLine = {
  id: string;
  category: string;
  description: string;
  unitPrice: number;
  billingUnit: QuoteBillingUnit;
  deposit: number;
};

type QuoteStatus = "Draft" | "Sent" | "Accepted" | "Declined";

type QuoteRequest = {
  id: string;
  clientName: string;
  title: string;
  location: string;
  guestCount: string;
  categories: string[];
  items?: QuoteLine[];
  startDate: string;
  endDate: string;
  unitPrice: number;
  validityDate: string;
  paymentTerms: string;
  cancellationTerms: string;
  included: string;
  excluded: string;
  notes: string;
  status: QuoteStatus;
  createdAt: string;
};

type QuoteLeadDraft = {
  key: string;
  clientName: string;
  category: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  unitPrice: number;
  notes: string;
};


const quoteStatuses: QuoteStatus[] = ["Draft", "Sent", "Accepted", "Declined"];

function getQuoteStatus(value: unknown): QuoteStatus {
  if (value === "Sent" || value === "Accepted" || value === "Declined" || value === "Draft") {
    return value;
  }

  return "Draft";
}

function getQuoteStatusLabel(status: QuoteStatus) {
  const labels: Record<QuoteStatus, string> = {
    Draft: "Draft",
    Sent: "Sent",
    Accepted: "Accepted",
    Declined: "Declined"
  };

  return labels[status];
}

function getQuoteStatusFrenchLabel(status: QuoteStatus) {
  const labels: Record<QuoteStatus, string> = {
    Draft: "Brouillon",
    Sent: "Envoyé",
    Accepted: "Accepté",
    Declined: "Refusé"
  };

  return labels[status];
}


function createQuoteId() {
  return `quote-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function escapeQuoteHtml(value: string) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatQuoteText(value: string) {
  return escapeQuoteHtml(value).replace(/\n/g, "<br />");
}

function readQuoteNumber(value: FormDataEntryValue | null) {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function formatQuoteDate(value: string) {
  if (!value) return "Not specified";

  const parsedDate = new Date(`${value}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Invalid date";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(parsedDate);
}

function formatQuoteLongDate(value: string) {
  if (!value) return "Not specified";

  const parsedDate = new Date(`${value}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return "Invalid date";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(parsedDate);
}

function formatQuotePrice(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  }).format(Number.isFinite(value) ? value : 0);
}

function getQuoteBillingUnit(value: unknown): QuoteBillingUnit {
  if (value === "week") return "week";
  if (value === "fixed") return "fixed";
  return "day";
}

function getQuoteUnitLabel(unit: QuoteBillingUnit) {
  if (unit === "week") return "week";
  if (unit === "fixed") return "fixed fee";
  return "day";
}

function getQuoteCategoryLabel(category: string) {
  const labels: Record<string, string> = {
    Villa: "Villa",
    Bateau: "Yacht",
    Voiture: "Car",
    Conciergerie: "Concierge services",
    Yacht: "Yacht",
    Car: "Car",
    "Concierge services": "Concierge services"
  };

  return labels[category] ?? category;
}

function getQuoteCategoryFrenchLabel(category: string) {
  const labels: Record<string, string> = {
    Villa: "Villa",
    Bateau: "Bateau",
    Voiture: "Voiture",
    Conciergerie: "Conciergerie",
    Yacht: "Bateau",
    Car: "Voiture",
    "Concierge services": "Conciergerie"
  };

  return labels[category] ?? category;
}

function getQuoteUnitShortLabel(unit: QuoteBillingUnit) {
  if (unit === "week") return "/ week";
  if (unit === "fixed") return "fixed fee";
  return "/ day";
}

function getQuoteDurationDays(quote: QuoteRequest) {
  if (!quote.startDate || !quote.endDate) return 1;

  const start = new Date(`${quote.startDate}T00:00:00`);
  const end = new Date(`${quote.endDate}T00:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1;

  const diff = Math.round((end.getTime() - start.getTime()) / 86400000);
  return Math.max(diff, 1);
}

function getQuoteBillingQuantity(quote: QuoteRequest, unit: QuoteBillingUnit) {
  const days = getQuoteDurationDays(quote);

  if (unit === "week") return Math.max(Math.ceil(days / 7), 1);
  if (unit === "fixed") return 1;

  return days;
}

function getQuoteQuantityLabel(quote: QuoteRequest, unit: QuoteBillingUnit) {
  const quantity = getQuoteBillingQuantity(quote, unit);
  const label = getQuoteUnitLabel(unit);

  if (unit === "fixed") return "1 fixed fee";

  return `${quantity} ${label}${quantity > 1 ? "s" : ""}`;
}

function getQuoteItems(quote: QuoteRequest): QuoteLine[] {
  if (Array.isArray(quote.items) && quote.items.length > 0) {
    return quote.items
      .map((item) => ({
        id: String(item.id ?? createQuoteId()),
        category: String(item.category ?? "").trim(),
        description: String(item.description ?? "").trim(),
        unitPrice: Number.isFinite(Number(item.unitPrice)) ? Number(item.unitPrice) : 0,
        billingUnit: getQuoteBillingUnit(item.billingUnit),
        deposit: Number.isFinite(Number(item.deposit)) ? Number(item.deposit) : 0
      }))
      .filter((item) => item.category);
  }

  return (Array.isArray(quote.categories) ? quote.categories : []).map((category) => ({
    id: category,
    category,
    description: "",
    unitPrice: Number.isFinite(quote.unitPrice) ? quote.unitPrice : 0,
    billingUnit: "day",
    deposit: 0
  }));
}

function getQuoteLineSubtotal(quote: QuoteRequest, item: QuoteLine) {
  return item.unitPrice * getQuoteBillingQuantity(quote, item.billingUnit);
}

function getQuoteSubtotal(quote: QuoteRequest) {
  return getQuoteItems(quote).reduce((sum, item) => sum + getQuoteLineSubtotal(quote, item), 0);
}

function getQuoteDepositTotal(quote: QuoteRequest) {
  return getQuoteItems(quote).reduce((sum, item) => sum + item.deposit, 0);
}

function getQuoteTotal(quote: QuoteRequest) {
  return getQuoteSubtotal(quote);
}

function openQuotePdf(quote: QuoteRequest) {
  const popup = window.open("", "_blank", "width=900,height=1100");

  if (!popup) {
    window.alert("Unable to open the quote. Please allow pop-ups for this site.");
    return;
  }

  const quoteItems = getQuoteItems(quote);
  const categories = quoteItems.length ? quoteItems.map((item) => getQuoteCategoryLabel(item.category)).join(", ") : "Non renseigné";
  const durationDays = getQuoteDurationDays(quote);
  const subtotal = getQuoteSubtotal(quote);
  const depositTotal = getQuoteDepositTotal(quote);
  const quoteReference = quote.id.replace("quote-", "DEV-").toUpperCase();

  const issuedAt = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(new Date());

  const linesHtml = quoteItems.length
    ? quoteItems.map((item) => `
      <tr>
        <td>
          <strong>${escapeQuoteHtml(getQuoteCategoryLabel(item.category))}</strong>
          ${item.description ? `<br /><small>${escapeQuoteHtml(item.description)}</small>` : ""}
        </td>
        <td>${formatQuotePrice(item.unitPrice)} ${escapeQuoteHtml(getQuoteUnitShortLabel(item.billingUnit))}</td>
        <td>${escapeQuoteHtml(getQuoteQuantityLabel(quote, item.billingUnit))}</td>
        <td>${formatQuotePrice(getQuoteLineSubtotal(quote, item))}</td>
        <td>${item.deposit > 0 ? formatQuotePrice(item.deposit) : "—"}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="5">Aucune prestation renseignée</td></tr>`;

  const includedHtml = quote.included
    ? `<section class="notes-block"><h2>Included</h2><p>${formatQuoteText(quote.included)}</p></section>`
    : "";

  const excludedHtml = quote.excluded
    ? `<section class="notes-block"><h2>Not included</h2><p>${formatQuoteText(quote.excluded)}</p></section>`
    : "";

  const notesHtml = quote.notes
    ? `<section class="notes-block"><h2>Notes</h2><p>${formatQuoteText(quote.notes)}</p></section>`
    : "";

  popup.document.open();
  popup.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeQuoteHtml(quoteReference)} · One Address Riviera</title>
  <style>
    body {
      margin: 0;
      padding: 42px;
      background: #f7f4ed;
      color: #011d30;
      font-family: Arial, sans-serif;
    }

    .page {
      max-width: 860px;
      margin: 0 auto;
      background: #fffaf1;
      border: 1px solid #d8c7a6;
      padding: 46px;
    }

    .top {
      display: flex;
      justify-content: space-between;
      gap: 28px;
      border-bottom: 1px solid #d8c7a6;
      padding-bottom: 28px;
      margin-bottom: 34px;
    }

    .brand {
      letter-spacing: 0.28em;
      text-transform: uppercase;
      color: #a9813f;
      font-weight: 800;
      font-size: 12px;
      margin-bottom: 12px;
    }

    h1 {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 46px;
      font-weight: 400;
      line-height: 1;
    }

    .meta {
      text-align: right;
      color: #68706d;
      font-size: 13px;
      line-height: 1.7;
    }

    .intro {
      margin: 0 0 30px;
      color: #68706d;
      line-height: 1.7;
    }

    .client-name {
      color: #011d30;
      font-weight: 800;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 24px;
    }

    th {
      text-align: left;
      color: #a9813f;
      letter-spacing: 0.13em;
      text-transform: uppercase;
      font-size: 10px;
      padding: 14px 0;
      border-bottom: 1px solid rgba(216, 199, 166, 0.75);
      vertical-align: top;
    }

    td {
      padding: 14px 0;
      border-bottom: 1px solid rgba(216, 199, 166, 0.55);
      vertical-align: top;
      line-height: 1.5;
    }

    td small {
      color: #68706d;
    }

    .section-title {
      margin: 34px 0 0;
      color: #a9813f;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      font-size: 11px;
    }

    .total-card {
      margin-top: 34px;
      padding: 26px;
      border: 1px solid #d8c7a6;
      background: rgba(169, 129, 63, 0.08);
      text-align: right;
    }

    .total-card span {
      display: block;
      color: #a9813f;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      font-size: 11px;
      font-weight: 800;
      margin-bottom: 8px;
    }

    .total-card strong {
      display: block;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 34px;
      font-weight: 400;
    }

    .total-card small {
      display: block;
      margin-top: 12px;
      color: #68706d;
      line-height: 1.5;
    }

    .notes-block {
      margin-top: 28px;
      padding-top: 22px;
      border-top: 1px solid #d8c7a6;
    }

    .notes-block h2 {
      margin: 0 0 10px;
      color: #a9813f;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      font-size: 11px;
    }

    .notes-block p {
      margin: 0;
      color: #68706d;
      line-height: 1.7;
    }

    .footer {
      margin-top: 48px;
      display: flex;
      justify-content: space-between;
      gap: 22px;
      color: #a9813f;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      font-size: 10px;
      font-weight: 800;
      border-top: 1px solid #d8c7a6;
      padding-top: 22px;
    }

    @media print {
      body {
        background: white;
        padding: 0;
      }

      .page {
        border: 0;
      }
    }
  </style>
</head>

<body>
  <main class="page">
    <header class="top">
      <div>
        <div class="brand">One Address Riviera</div>
        <h1>Quote</h1>
      </div>

      <div class="meta">
        <div>${escapeQuoteHtml(quoteReference)}</div>
        <div>${escapeQuoteHtml(issuedAt)}</div>
      </div>
    </header>

    <p class="intro">
      Quote prepared for <span class="client-name">${escapeQuoteHtml(quote.clientName)}</span>.
      ${quote.title ? `<br />${escapeQuoteHtml(quote.title)}` : ""}
    </p>

    <table>
      <tr><th>Client</th><td>${escapeQuoteHtml(quote.clientName)}</td></tr>
      <tr><th>Location</th><td>${escapeQuoteHtml(quote.location || "Not specified")}</td></tr>
      <tr><th>Guests</th><td>${escapeQuoteHtml(quote.guestCount || "Not specified")}</td></tr>
      <tr><th>Service(s)</th><td>${escapeQuoteHtml(categories)}</td></tr>
      <tr><th>Requested dates</th><td>From ${formatQuoteDate(quote.startDate)} to ${formatQuoteDate(quote.endDate)}</td></tr>
      <tr><th>Actual duration</th><td>${durationDays} day${durationDays > 1 ? "s" : ""}</td></tr>
      <tr><th>Quote validity</th><td>${quote.validityDate ? formatQuoteLongDate(quote.validityDate) : "To be confirmed"}</td></tr>
    </table>

    <h2 class="section-title">Service details</h2>

    <table>
      <thead>
        <tr>
          <th>Service</th>
          <th>Price</th>
          <th>Quantity</th>
          <th>Subtotal</th>
          <th>Security deposit</th>
        </tr>
      </thead>
      <tbody>
        ${linesHtml}
      </tbody>
    </table>

    <section class="total-card">
      <span>Services total</span>
      <strong>${formatQuotePrice(subtotal)}</strong>
      <small>
        Total security deposit to be expected: ${depositTotal > 0 ? formatQuotePrice(depositTotal) : "no security deposit specified"}.
        Security deposits are shown separately and are not included in the service total.
      </small>
    </section>

    ${includedHtml}
    ${excludedHtml}

    <section class="notes-block">
      <h2>Payment terms</h2>
      <p>${formatQuoteText(quote.paymentTerms || "Deposit due upon confirmation, balance due before the beginning of the service.")}</p>
    </section>

    <section class="notes-block">
      <h2>Cancellation terms</h2>
      <p>${formatQuoteText(quote.cancellationTerms || "Terms to be confirmed according to availability, season and service providers.")}</p>
    </section>

    ${notesHtml}

    <footer class="footer">
      <span>Private Riviera Experiences</span>
      <span>contact@oneaddressriviera.com</span>
    </footer>
  
        {quickEntryOpen && (
          <section className="quick-entry-panel" style={{
            position: "fixed",
            top: 90,
            right: 32,
            zIndex: 50,
            width: "min(520px, calc(100vw - 48px))",
            maxHeight: "calc(100vh - 130px)",
            overflow: "auto",
            background: "#f7f1e7",
            border: "1px solid rgba(160, 120, 70, 0.35)",
            boxShadow: "0 24px 80px rgba(0,0,0,0.25)",
            padding: 24
          }}>
            <div className="eyebrow">Saisie rapide</div>
            <h2>Créer contact + lead</h2>

            <p className="muted-line">
              Colle un email, WhatsApp ou note client. Le CRM prépare automatiquement les champs principaux.
            </p>

            <textarea
              value={quickEntryText}
              onChange={(event) => setQuickEntryText(event.target.value)}
              placeholder={"Exemple :\nClient : Heily Aavik\nRecherche villa à Super Cannes\nDates : 22/07/2026 au 29/07/2026\nBudget : 18 000 €\nBesoin : 5 chambres, proche Cannes"}
              style={{
                width: "100%",
                minHeight: 180,
                marginTop: 16,
                padding: 14,
                border: "1px solid rgba(160, 120, 70, 0.35)",
                background: "#fffaf2"
              }}
            />

            {quickEntryText.trim() && (
              <div style={{
                marginTop: 16,
                padding: 14,
                background: "rgba(255,255,255,0.55)",
                border: "1px solid rgba(160, 120, 70, 0.25)"
              }}>
                {(() => {
                  const draft = parseQuickEntryText(quickEntryText);

                  return (
                    <>
                      <div><strong>Contact :</strong> {draft.contactName}</div>
                      <div><strong>Catégorie :</strong> {draft.category}</div>
                      <div><strong>Ville / lieu :</strong> {draft.destination || "À qualifier"}</div>
                      <div><strong>Email :</strong> {draft.email || "À qualifier"}</div>
                      <div><strong>Téléphone :</strong> {draft.phone || "À qualifier"}</div>
                      <div><strong>Budget :</strong> {draft.budget ? draft.budget.toLocaleString("fr-FR") + " €" : "À qualifier"}</div>
                      <div><strong>Dates :</strong> {draft.rentalStartDate || "?"} → {draft.rentalEndDate || "?"}</div>
                    </>
                  );
                })()}
              </div>
            )}

            <div style={{ display: "flex", gap: 12, marginTop: 18, justifyContent: "flex-end" }}>
              <button className="secondary-button" type="button" onClick={() => setQuickEntryOpen(false)}>
                Annuler
              </button>
              <button className="primary-button" type="button" onClick={createQuickEntry}>
                Créer
              </button>
            </div>
          </section>
        )}

</main>

  <script>
    window.onload = () => {
      window.focus();
      window.print();
    };
  </script>
</body>
</html>`);
  popup.document.close();
}


function normalizeQuoteRequest(value: unknown): QuoteRequest | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;

  return {
    ...raw,
    id: String(raw.id || createQuoteId()),
    clientName: String(raw.clientName || ""),
    categories: Array.isArray(raw.categories) ? raw.categories.map(String) : [],
    startDate: String(raw.startDate || ""),
    endDate: String(raw.endDate || ""),
    unitPrice: Number.isFinite(Number(raw.unitPrice)) ? Number(raw.unitPrice) : 0,
    notes: String(raw.notes || ""),
    status: getQuoteStatus(raw.status),
    createdAt: String(raw.createdAt || new Date().toISOString())
  } as QuoteRequest;
}

function loadSavedQuotes() {
  if (typeof window === "undefined") return [] as QuoteRequest[];

  try {
    const raw = window.localStorage.getItem(QUOTES_STORAGE_KEY);
    if (!raw) return [] as QuoteRequest[];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [] as QuoteRequest[];

    return parsed
      .map(normalizeQuoteRequest)
      .filter((quote): quote is QuoteRequest => Boolean(quote));
  } catch {
    return [] as QuoteRequest[];
  }
}

function saveQuotesToBrowser(quotes: QuoteRequest[]) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(QUOTES_STORAGE_KEY, JSON.stringify(quotes));
}

function QuotesView({ contacts, prefilledLead }: { contacts: Contact[]; prefilledLead?: QuoteLeadDraft | null }) {
  const [quotes, setQuotes] = useState<QuoteRequest[]>(() => loadSavedQuotes());

  useEffect(() => {
    saveQuotesToBrowser(quotes);
  }, [quotes]);

  function updateQuoteStatus(id: string, status: QuoteStatus) {
    setQuotes((current) =>
      current.map((quote) => (quote.id === id ? { ...quote, status } : quote))
    );
  }

  const quoteCategories = ["Villa", "Bateau", "Voiture", "Conciergerie"];
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);

  // PREFILL_QUOTE_FROM_LEAD
  useEffect(() => {
    if (!prefilledLead) return;

    const foundForm = document.querySelector<HTMLFormElement>('form[data-quote-form="true"]');

    if (foundForm === null) {
      return;
    }

    const quoteForm: HTMLFormElement = foundForm;

    quoteForm.reset();
    setEditingQuoteId(null);

    function setField(name: string, value: string | number | undefined) {
      const field = quoteForm.elements.namedItem(name);

      if (
        field instanceof HTMLInputElement ||
        field instanceof HTMLSelectElement ||
        field instanceof HTMLTextAreaElement
      ) {
        field.value = String(value ?? "");
      }
    }

    const selectedCategory = quoteCategories.includes(prefilledLead.category)
      ? prefilledLead.category
      : "Villa";

    setField("clientName", prefilledLead.clientName);
    setField("title", prefilledLead.title);
    setField("location", prefilledLead.location);
    setField("startDate", prefilledLead.startDate);
    setField("endDate", prefilledLead.endDate);
    setField("notes", prefilledLead.notes);
    setField("status", "Draft");

    quoteForm.querySelectorAll<HTMLInputElement>('input[name="categories"]').forEach((checkbox) => {
      checkbox.checked = checkbox.value === selectedCategory;
    });

    setField(`description${selectedCategory}`, prefilledLead.title);
    setField(`price${selectedCategory}`, prefilledLead.unitPrice);
    setField(`unit${selectedCategory}`, "day");

    window.setTimeout(() => {
      quoteForm.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 80);
  }, [prefilledLead]);

  function fillQuoteForm(quote: QuoteRequest) {
    const foundForm = document.querySelector<HTMLFormElement>('form[data-quote-form="true"]');

    if (foundForm === null) {
      return;
    }

    const quoteForm: HTMLFormElement = foundForm;

    quoteForm.reset();

    function setField(name: string, value: string | number | undefined) {
      const field = quoteForm.elements.namedItem(name);

      if (
        field instanceof HTMLInputElement ||
        field instanceof HTMLSelectElement ||
        field instanceof HTMLTextAreaElement
      ) {
        field.value = String(value ?? "");
      }
    }

    setEditingQuoteId(quote.id);

    setField("clientName", quote.clientName);
    setField("title", quote.title);
    setField("location", quote.location);
    setField("guestCount", quote.guestCount);
    setField("startDate", quote.startDate);
    setField("endDate", quote.endDate);
    setField("validityDate", quote.validityDate);
    setField("included", quote.included);
    setField("excluded", quote.excluded);
    setField("paymentTerms", quote.paymentTerms);
    setField("cancellationTerms", quote.cancellationTerms);
    setField("notes", quote.notes);
    setField("status", getQuoteStatus(quote.status));

    const quoteItems = getQuoteItems(quote);

    quoteForm.querySelectorAll<HTMLInputElement>('input[name="categories"]').forEach((checkbox) => {
      const item = quoteItems.find((quoteItem) => quoteItem.category === checkbox.value);
      checkbox.checked = Boolean(item);

      if (item) {
        setField(`description${item.category}`, item.description);
        setField(`price${item.category}`, item.unitPrice);
        setField(`unit${item.category}`, item.billingUnit);
        setField(`deposit${item.category}`, item.deposit);
      }
    });

    window.setTimeout(() => {
      quoteForm.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 80);
  }

  function addQuote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    const selectedCategories = form.getAll("categories").map(String);
    const clientName = String(form.get("clientName") ?? "").trim();
    const title = String(form.get("title") ?? "").trim();
    const location = String(form.get("location") ?? "").trim();
    const guestCount = String(form.get("guestCount") ?? "").trim();
    const startDate = String(form.get("startDate") ?? "");
    const endDate = String(form.get("endDate") ?? "");
    const validityDate = String(form.get("validityDate") ?? "");
    const paymentTerms = String(form.get("paymentTerms") ?? "").trim();
    const cancellationTerms = String(form.get("cancellationTerms") ?? "").trim();
    const included = String(form.get("included") ?? "").trim();
    const excluded = String(form.get("excluded") ?? "").trim();
    const notes = String(form.get("notes") ?? "").trim();
    const status = getQuoteStatus(form.get("status"));

    const quoteItems: QuoteLine[] = selectedCategories.map((category) => ({
      id: createQuoteId(),
      category,
      description: String(form.get(`description${category}`) ?? "").trim(),
      unitPrice: readQuoteNumber(form.get(`price${category}`)),
      billingUnit: getQuoteBillingUnit(form.get(`unit${category}`)),
      deposit: readQuoteNumber(form.get(`deposit${category}`))
    }));

    const unitPrice = quoteItems.reduce((sum, item) => sum + item.unitPrice, 0);

    if (!clientName) {
      window.alert("Sélectionnez un client.");
      return;
    }

    if (selectedCategories.length === 0) {
      window.alert("Sélectionnez au moins une prestation.");
      return;
    }

    if (quoteItems.some((item) => item.unitPrice <= 0)) {
      window.alert("Renseignez un prix pour chaque prestation sélectionnée.");
      return;
    }

    if (!startDate || !endDate) {
      window.alert("Renseignez les dates demandées.");
      return;
    }

    const quote: QuoteRequest = {
      id: editingQuoteId ?? createQuoteId(),
      clientName,
      title,
      location,
      guestCount,
      categories: selectedCategories,
      items: quoteItems,
      startDate,
      endDate,
      unitPrice,
      validityDate,
      paymentTerms,
      cancellationTerms,
      included,
      excluded,
      notes,
      status,
      createdAt: editingQuoteId
        ? quotes.find((item) => item.id === editingQuoteId)?.createdAt ?? new Date().toISOString()
        : new Date().toISOString()
    };

    if (editingQuoteId) {
      setQuotes((current) => current.map((item) => (item.id === editingQuoteId ? quote : item)));
      setEditingQuoteId(null);
    } else {
      setQuotes((current) => [quote, ...current]);
    }

    formElement.reset();
    window.setTimeout(() => {
      document.getElementById("quotes-list-panel")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 80);

  }

  return (
    <div className="two-columns wide-left">
      <section id="quotes-list-panel" className="card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Devis</p>
            <h3>{quotes.length} devis préparé{quotes.length > 1 ? "s" : ""}</h3>
          </div>
        </div>

        <div className="list-stack">
          {quotes.length === 0 ? (
            <p className="muted-line">Aucun devis pour le moment. Créez d’abord un contact et un lead, puis générez un devis depuis le lead.</p>
          ) : (
            quotes.map((quote) => (
              <article className="quote-card" key={quote.id}>
                <div>
                  <p className="eyebrow">{getQuoteItems(quote).map((item) => getQuoteCategoryFrenchLabel(item.category)).join(" · ")}</p>
                  <h3>{quote.title || quote.clientName}</h3>
                  <p>{quote.clientName}</p>
                  <p>Du {formatQuoteDate(quote.startDate)} au {formatQuoteDate(quote.endDate)}</p>
                  <strong>{formatQuotePrice(getQuoteSubtotal(quote))}</strong>

                  {getQuoteDepositTotal(quote) > 0 && (
                    <small>Caution : {formatQuotePrice(getQuoteDepositTotal(quote))}</small>
                  )}

                  <ul className="quote-line-preview">
                    {getQuoteItems(quote).map((item) => (
                      <li key={item.id}>
                        <span>{getQuoteCategoryFrenchLabel(item.category)}</span>
                        <strong>{formatQuotePrice(item.unitPrice)} {getQuoteUnitShortLabel(item.billingUnit)}</strong>
                      </li>
                    ))}
                  </ul>

                  {quote.location && <p>{quote.location}</p>}
                </div>

                <div className="quote-actions">
                  <select
                    value={getQuoteStatus(quote.status)}
                    onChange={(event) => updateQuoteStatus(quote.id, getQuoteStatus(event.target.value))}
                    aria-label="Devis status"
                  >
                    {quoteStatuses.map((status) => (
                      <option key={status} value={status}>{getQuoteStatusFrenchLabel(status)}</option>
                    ))}
                  </select>

                  <button className="secondary-button" type="button" onClick={() => fillQuoteForm(quote)}>
                    Modifier
                  </button>

                  <button className="primary-button" type="button" onClick={() => openQuotePdf(quote)}>
                    Générer PDF
                  </button>

                  <button
                    className="danger-link"
                    type="button"
                    onClick={() => {
                      const confirmed = window.confirm("Supprimer ce devis ?");
                      if (!confirmed) return;
                      setQuotes((current) => current.filter((item) => item.id !== quote.id));
                    }}
                  >
                    Supprimer
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="card form-card">
        <p className="eyebrow">{editingQuoteId ? "Modification" : "Nouveau"}</p>
        <h3>{editingQuoteId ? "Modifier le devis" : "Créer un devis"}</h3>

        <form className="form-grid" data-quote-form="true" onSubmit={addQuote}>
          <label>Client
            <select name="clientName" required>
              <option value="">Sélectionner un client</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.name}>
                  {contact.name}
                </option>
              ))}
            </select>
          </label>

          <label>Titre du devis
            <input name="title" placeholder="Séjour villa, location bateau, voiture, conciergerie..." />
          </label>

          <label>Lieu / destination
            <input name="location" placeholder="Cannes, Saint-Tropez, Monaco..." />
          </label>

          <label>Nombre de voyageurs
            <input name="guestCount" placeholder="Ex : 6 adultes, 2 enfants" />
          </label>

          <label>Date début demandée
            <input name="startDate" type="date" required />
          </label>

          <label>Date fin demandée
            <input name="endDate" type="date" required />
          </label>

          <label>Validité du devis
            <input name="validityDate" type="date" />
          </label>

          <fieldset className="full quote-category-box quote-lines-box">
            <legend>Prestations, prix et cautions</legend>

            {quoteCategories.map((category) => (
              <div className="quote-line-input" key={category}>
                <label>
                  <input type="checkbox" name="categories" value={category} />
                  {getQuoteCategoryFrenchLabel(category)}
                </label>

                <input name={`description${category}`} placeholder="Détail prestation" />

                <input name={`price${category}`} type="number" min="0" placeholder="Prix" />

                <select name={`unit${category}`} defaultValue="day">
                  <option value="day">Prix / jour</option>
                  <option value="week">Prix / semaine</option>
                  <option value="fixed">Forfait</option>
                </select>

                <input name={`deposit${category}`} type="number" min="0" placeholder="Caution" />
              </div>
            ))}
          </fieldset>

          <label className="full">Inclus
            <textarea name="included" placeholder="Ex : accueil, linge, ménage intermédiaire, skipper, livraison..." />
          </label>

          <label className="full">Non inclus
            <textarea name="excluded" placeholder="Ex : carburant, extras, transferts, repas, taxe de séjour..." />
          </label>

          <label className="full">Conditions de paiement
            <textarea name="paymentTerms" placeholder="Ex : 50 % à la réservation, solde 30 jours avant arrivée..." />
          </label>

          <label className="full">Conditions d’annulation
            <textarea name="cancellationTerms" placeholder="Conditions selon saison, disponibilité et prestataires..." />
          </label>

          <label className="full">Notes internes / détails client
            <textarea name="notes" placeholder="Informations utiles, préférences client, demandes spéciales..." />
          </label>

          <button className="primary-button" type="submit">
            {editingQuoteId ? "Enregistrer les modifications" : "Créer le devis"}
          </button>

          {editingQuoteId && (
            <button
              className="ghost-button"
              type="button"
              onClick={() => {
                setEditingQuoteId(null);
                const form = document.querySelector<HTMLFormElement>('form[data-quote-form="true"]');
                form?.reset();
              }}
            >
              Annuler la modification
            </button>
          )}
        </form>
      </section>
    </div>
  );
}


function CRMAppContent({ sessionEmail, onLogout }: { sessionEmail: string; onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  const [quickEntryText, setQuickEntryText] = useState("");
  const [quickEntryOpen, setQuickEntryOpen] = useState(false);

  // AUTO_SCROLL_LEAD_DETAILS
  useEffect(() => {
    if (activeTab !== "leads") return;

    function handleLeadDetailsClick(event: MouseEvent) {
      const target = event.target;

      if (!(target instanceof Element)) return;

      const button = target.closest("button");

      if (!button) return;

      const label = button.textContent?.trim().toLowerCase() ?? "";

      if (label !== "détails" && label !== "details") return;

      window.setTimeout(() => {
        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: "smooth"
        });
      }, 120);
    }

    document.addEventListener("click", handleLeadDetailsClick);

    return () => {
      document.removeEventListener("click", handleLeadDetailsClick);
    };
  }, [activeTab]);
  // AUTO_SCROLL_ASSET_DETAILS
  useEffect(() => {
    if (activeTab !== "properties" && activeTab !== "vehicles" && activeTab !== "boats") return;

    function handleAssetDetailsClick(event: MouseEvent) {
      const target = event.target;

      if (!(target instanceof Element)) return;

      const button = target.closest("button");

      if (!button) return;

      const label = button.textContent?.trim().toLowerCase() ?? "";

      if (label !== "détails" && label !== "details") return;

      window.setTimeout(() => {
        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: "smooth"
        });
      }, 120);
    }

    document.addEventListener("click", handleAssetDetailsClick);

    return () => {
      document.removeEventListener("click", handleAssetDetailsClick);
    };
  }, [activeTab]);

  const [leadDraftContactName, setLeadDraftContactName] = useState("");
  const [taskDraftLeadId, setTaskDraftLeadId] = useState("");
  const [taskDraftTitle, setTaskDraftTitle] = useState("");
  const [quoteDraftFromLead, setQuoteDraftFromLead] = useState<QuoteLeadDraft | null>(null);
  const [query, setQuery] = useState("");
  const [data, setData] = useState<CRMData>(emptyData);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeTab]);


  // MIGRATION_VISITE_TO_DEVIS
  useEffect(() => {
    setData((current) => ({
      ...current,
      leads: current.leads.map((lead) =>
        lead.status === ("Visite" as LeadStatus) ? { ...lead, status: "Devis" as LeadStatus } : lead
      )
    }));
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<CRMData>;
        setData({
          ...emptyData,
          ...parsed,
          contacts: parsed.contacts ?? emptyData.contacts,
          leads: parsed.leads ?? emptyData.leads,
          properties: parsed.properties ?? emptyData.properties,
          vehicles: parsed.vehicles ?? emptyData.vehicles,
          boats: parsed.boats ?? emptyData.boats,
          tasks: parsed.tasks ?? emptyData.tasks
        });
      }
    } catch {
      setToast({ message: "Impossible de lire la sauvegarde locale.", tone: "warning" });
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);
  useEffect(() => {
    if (!toast) return;

    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const stats = useMemo(() => {
    const pipeline = data.leads
      .filter((lead) => lead.status !== "Perdu")
      .reduce((sum, lead) => sum + lead.value, 0);
    const won = data.leads.filter((lead) => lead.status === "Gagné").reduce((sum, lead) => sum + lead.value, 0);
    const openTasks = data.tasks.filter((task) => task.status !== "Terminé").length;
    const availableProperties = data.properties.filter((property) => property.status === "Disponible").length;
    return { pipeline, won, openTasks, availableProperties };
  }, [data]);

  const filteredContacts = useMemo(() => {
    return data.contacts.filter((contact) => searchMatch(query, [contact.name, contact.kind, contact.email, contact.phone, contact.city, contact.postalAddress ?? ""]));
  }, [data.contacts, query]);

  const filteredLeads = useMemo(() => {
    return data.leads.filter((lead) => searchMatch(query, [lead.category, lead.contactName, lead.status, lead.nextAction, lead.rentalStartDate, lead.rentalEndDate]));
  }, [data.leads, query]);

  const filteredProperties = useMemo(() => {
    return data.properties.filter((property) => searchMatch(query, [property.name, property.city, property.type, property.owner, property.status]));
  }, [data.properties, query]);

  const filteredVehicles = useMemo(() => {
    return (data.vehicles ?? []).filter((vehicle) => searchMatch(query, [vehicle.name, vehicle.brand, vehicle.model, vehicle.city, vehicle.owner, vehicle.status]));
  }, [data.vehicles, query]);

  const filteredBoats = useMemo(() => {
    return (data.boats ?? []).filter((boat) => searchMatch(query, [boat.name, boat.port, boat.type, boat.owner, boat.status]));
  }, [data.boats, query]);

  const filteredTasks = useMemo(() => {
    const matchingTasks = data.tasks.filter((task) => {
      const linkedLead = data.leads.find((lead) => lead.id === task.linkedTo);
      const linkedLeadLabel = linkedLead ? `${linkedLead.category} ${linkedLead.contactName}` : task.linkedTo;

      return searchMatch(query, [task.title, task.owner, task.status, linkedLeadLabel]);
    });

    return [
      ...sortByUrgency(matchingTasks.filter((task) => task.status !== "Terminé")),
      ...sortByUrgency(matchingTasks.filter((task) => task.status === "Terminé"))
    ];
  }, [data.tasks, data.leads, query]);

  function notify(message: string, tone: Toast["tone"] = "success") {
    setToast({ message, tone });
  }

  function normalizeDuplicateKey(value?: string | number | null) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ");
  }

  function confirmDuplicateContact(contact: Contact) {
    const candidateName = normalizeDuplicateKey(contact.name);
    const candidateEmail = normalizeDuplicateKey(contact.email);

    const duplicate = data.contacts.find((existing) => {
      const sameName = candidateName && normalizeDuplicateKey(existing.name) === candidateName;
      const sameEmail = candidateEmail && normalizeDuplicateKey(existing.email) === candidateEmail;

      return sameName || sameEmail;
    });

    if (!duplicate) return true;

    return window.confirm(
      `Doublon possible détecté.\n\nContact existant : ${duplicate.name}${duplicate.email ? ` (${duplicate.email})` : ""}\nNouveau contact : ${contact.name}${contact.email ? ` (${contact.email})` : ""}\n\nCréer quand même ?`
    );
  }

  function confirmDuplicateLead(lead: Lead) {
    const candidateContact = normalizeDuplicateKey(lead.contactName);
    const candidateCategory = normalizeDuplicateKey(lead.category);
    const candidateStart = normalizeDuplicateKey(lead.rentalStartDate);
    const candidateEnd = normalizeDuplicateKey(lead.rentalEndDate);

    const duplicate = data.leads.find((existing) => {
      const sameContact = normalizeDuplicateKey(existing.contactName) === candidateContact;
      const sameCategory = normalizeDuplicateKey(existing.category) === candidateCategory;
      const sameAsset = Boolean(lead.assetId && existing.assetId && existing.assetId === lead.assetId);
      const sameDates =
        Boolean(candidateStart || candidateEnd) &&
        normalizeDuplicateKey(existing.rentalStartDate) === candidateStart &&
        normalizeDuplicateKey(existing.rentalEndDate) === candidateEnd;

      return sameContact && sameCategory && (sameAsset || sameDates);
    });

    if (!duplicate) return true;

    return window.confirm(
      `Lead similaire déjà existant.\n\nContact : ${duplicate.contactName}\nCatégorie : ${duplicate.category}\nDates : ${duplicate.rentalStartDate || "?"} → ${duplicate.rentalEndDate || "?"}\n\nCréer quand même ?`
    );
  }

  function confirmDuplicateAsset(kind: "bien" | "voiture" | "bateau", item: { name?: string; city?: string; port?: string }) {
    const candidateName = normalizeDuplicateKey(item.name);
    const candidateLocation = normalizeDuplicateKey(item.city || item.port);

    const source =
      kind === "bien"
        ? data.properties
        : kind === "voiture"
          ? (data.vehicles ?? [])
          : (data.boats ?? []);

    const duplicate = source.find((existing: any) => {
      const sameName = normalizeDuplicateKey(existing.name) === candidateName;
      const existingLocation = normalizeDuplicateKey(existing.city || existing.port);
      const sameLocation = !candidateLocation || !existingLocation || existingLocation === candidateLocation;

      return sameName && sameLocation;
    });

    if (!duplicate) return true;

    return window.confirm(
      `Doublon possible détecté.\n\n${kind.charAt(0).toUpperCase() + kind.slice(1)} existant : ${duplicate.name}\nNouveau : ${item.name}\n\nCréer quand même ?`
    );
  }






  function normalizeQuickEntryDate(value: string) {
    const match = value.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
    if (!match) return "";

    const day = match[1].padStart(2, "0");
    const month = match[2].padStart(2, "0");
    const rawYear = match[3];
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;

    return `${year}-${month}-${day}`;
  }

  function parseQuickEntryText(text: string) {
    const raw = text.trim();
    const lower = raw.toLowerCase();

    const email = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
    const phone = raw.match(/(\+?\d[\d\s().-]{7,}\d)/)?.[0]?.trim() ?? "";

    const budgetMatch = raw.match(/(?:budget|prix|valeur|montant)\s*[:\-]?\s*([\d\s.,]+)\s*€?/i)
      ?? raw.match(/([\d\s]{4,})\s*€/);

    const budget = budgetMatch
      ? Number(String(budgetMatch[1]).replace(/[^\d]/g, ""))
      : 0;

    const explicitName = raw.match(/(?:client|nom|contact)\s*[:\-]\s*([^\n]+)/i)?.[1]?.trim();

    const fallbackName = raw
      .split(/\n/)
      .map((line) => line.trim())
      .find((line) =>
        line.length > 2 &&
        line.length < 60 &&
        !line.includes("@") &&
        !/budget|prix|date|villa|bateau|voiture|conciergerie|message|note/i.test(line)
      );

    const contactName = explicitName || fallbackName || "Contact à qualifier";

    const destination =
      raw.match(/(?:ville|lieu|destination|secteur)\s*[:\-]\s*([^\n]+)/i)?.[1]?.trim()
      || (lower.includes("super cannes") ? "Super Cannes" : "")
      || (lower.includes("cannes") ? "Cannes" : "");

    const category =
      lower.includes("bateau") || lower.includes("yacht") ? "Yacht"
      : lower.includes("voiture") || lower.includes("car") ? "Voiture"
      : lower.includes("conciergerie") ? "Conciergerie"
      : "Villa";

    const dateMatches = [...raw.matchAll(/\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/g)].map((m) => m[0]);
    const rentalStartDate = dateMatches[0] ? normalizeQuickEntryDate(dateMatches[0]) : "";
    const rentalEndDate = dateMatches[1] ? normalizeQuickEntryDate(dateMatches[1]) : "";

    const bedroomsMatch = raw.match(/(\d+)\s*(?:chambres|chambre|beds|bedrooms)/i);
    const peopleMatch = raw.match(/(\d+)\s*(?:personnes|pax|guests|adultes|adults)/i);

    const nextAction =
      category === "Villa"
        ? "Qualifier dates, destination, nombre de personnes, chambres, budget réel et critères prioritaires."
        : category === "Yacht"
          ? "Qualifier dates, port, nombre de personnes, durée, budget et type de bateau."
          : category === "Voiture"
            ? "Qualifier dates, lieu de livraison, modèle souhaité, budget et assurance."
            : "Qualifier besoin conciergerie, dates, lieu, urgence et budget.";

    const notes = [
      raw,
      bedroomsMatch ? `Chambres détectées : ${bedroomsMatch[1]}` : "",
      peopleMatch ? `Personnes détectées : ${peopleMatch[1]}` : ""
    ].filter(Boolean).join("\\n\\n");

    return {
      contactName,
      email,
      phone,
      budget,
      destination,
      category,
      rentalStartDate,
      rentalEndDate,
      nextAction,
      notes
    };
  }
  function saveQuickEntryText(rawText: string) {
    const cleanedText = rawText.trim();

    if (!cleanedText) {
      window.alert("Colle d’abord un message client.");
      return;
    }

    const forbiddenPatterns = [
      /git\s+(add|commit|push|checkout|status)/i,
      /npm\s+(run|install|build)/i,
      /components\/CRMApp\.tsx/i,
      /function\s+\w+/i,
      /const\s+\w+\s*=/i,
      /<button|<div|<section/i
    ];

    if (forbiddenPatterns.some((pattern) => pattern.test(cleanedText))) {
      window.alert("Créer depuis message refusé : ce texte ressemble à du code ou à une commande terminal, pas à une demande client.");
      return;
    }

    const draft = parseQuickEntryText(cleanedText);

    const weakNames = [
      "client",
      "hello",
      "bonjour",
      "one address riviera",
      "oneaddress riviera",
      "à compléter",
      "a completer",
      "git add",
      "npm run"
    ];

    const currentName = String(draft.contactName || "").trim();
    const nameLooksWeak =
      !currentName ||
      currentName.length < 3 ||
      weakNames.some((weakName) => currentName.toLowerCase().includes(weakName));

    if (nameLooksWeak) {
      const manualName = window.prompt(
        "Nom du client non détecté clairement. Indique le nom complet du client avant de créer la fiche :",
        draft.email ? draft.email.split("@")[0] : ""
      );

      if (!manualName?.trim()) {
        window.alert("Création annulée : nom client obligatoire.");
        return;
      }

      draft.contactName = manualName.trim();
    }

    const confirmed = window.confirm(
      `Créer un contact + lead pour : ${draft.contactName} ?\n\nEmail : ${draft.email || "À compléter"}\nCatégorie : ${draft.category || "À compléter"}\nDestination / actif : ${draft.destination || "À compléter"}\nDates : ${draft.rentalStartDate || "À compléter"} → ${draft.rentalEndDate || "À compléter"}\nBudget : ${draft.budget ? draft.budget.toLocaleString("fr-FR") + " €" : "À compléter"}\n\nProchaine action :\n${draft.nextAction || "À compléter"}`
    );

    if (!confirmed) return;

    const today = new Date().toISOString().slice(0, 10);
    const contactId = crypto.randomUUID();
    const leadId = crypto.randomUUID();

    const newContact = {
      id: contactId,
      name: draft.contactName,
      kind: "Client",
      email: draft.email,
      phone: draft.phone,
      city: draft.destination,
      postalAddress: "",
      budget: draft.budget,
      source: "Saisie rapide",
      notes: draft.notes,
      clientLevel: "Standard",
      preferredLanguage: "Français",
      relationshipStatus: "Prospect",
      preferences: "",
      importantNotes: "",
      createdAt: today
    } as any;

    const newLead = {
      id: leadId,
      category: draft.category,
      contactName: draft.contactName,
      assetType: "",
      assetId: "",
      status: "Nouveau",
      value: draft.budget,
      priority: "Moyenne",
      nextAction: draft.nextAction,
      notes: draft.notes,
      dueDate: today,
      rentalStartDate: draft.rentalStartDate,
      rentalEndDate: draft.rentalEndDate
    } as any;

    if (!confirmDuplicateContact(newContact as Contact)) return;
    if (!confirmDuplicateLead(newLead as Lead)) return;

    setData((current: any) => ({
      ...current,
      contacts: [newContact, ...(current.contacts ?? [])],
      leads: [newLead, ...(current.leads ?? [])]
    }));

    setQuickEntryText("");
    setQuickEntryOpen(false);

    notify("Contact et lead créés depuis la saisie rapide.");
  }


  function parseInventoryLine(line: string) {
    return line
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean);
  }


  function parseExpressNumber(value?: string) {
    const cleaned = String(value ?? "").trim();

    if (!cleaned || /à compléter|a completer|n\/a|na/i.test(cleaned)) return 0;

    return Number(cleaned.replace(/[^\d]/g, "")) || 0;
  }

  function parseExpressDateRange(value?: string) {
    const raw = String(value ?? "");
    const matches = [...raw.matchAll(/\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/g)].map((m) => m[0]);

    return {
      start: matches[0] ? normalizeQuickEntryDate(matches[0]) : "",
      end: matches[1] ? normalizeQuickEntryDate(matches[1]) : ""
    };
  }


  function openSafeCsvImportPrompt() {
    const choice = window.prompt(
      "Import sécurisé :\n\n1 = Contacts complets\n2 = Leads complets\n3 = Biens\n4 = Voitures\n5 = Bateaux\n\nChaque ligne doit utiliser le séparateur |.\nAucune donnée existante ne sera écrasée.",
      "1"
    );

    if (!choice) return;

    const type = choice.trim();

    const examples: Record<string, string> = {
      "1": "Nom | Type | Niveau client | Langue préférée | Relation | Email | Téléphone | Ville | Adresse postale | Budget | Source | Préférences | Notes importantes | Notes",
      "2": "Catégorie | Contact | Actif proposé | Début réservation | Fin réservation | Valeur | Statut | Priorité | Échéance réponse | Prochaine action | Notes internes",
      "3": "Nom | Type | Ville | Prix | Statut | Propriétaire | Notes",
      "4": "Nom | Marque | Modèle | Ville | Prix/jour | Statut | Propriétaire | Notes",
      "5": "Nom | Port | Type | Prix/jour | Statut | Propriétaire | Notes"
    };

    const raw = window.prompt(
      `Colle les lignes à importer.\n\nFormat attendu :\n${examples[type] || examples["1"]}\n\nTu peux coller plusieurs lignes, une par ligne.`,
      ""
    );

    if (!raw) return;

    const lines = raw
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => line && line.includes("|"));

    if (lines.length === 0) {
      window.alert("Import refusé : aucune ligne valide avec séparateur |.");
      return;
    }

    function cleanImportValue(value?: string) {
      const cleaned = String(value ?? "").trim();

      if (!cleaned || /à compléter|a completer|n\/a|na/i.test(cleaned)) {
        return "";
      }

      return cleaned;
    }

    function numberImportValue(value?: string) {
      const cleaned = cleanImportValue(value);
      if (!cleaned) return 0;
      return Number(cleaned.replace(/[^\d]/g, "")) || 0;
    }

    function dateImportValue(value?: string) {
      const cleaned = cleanImportValue(value);
      if (!cleaned) return "";
      return normalizeQuickEntryDate(cleaned) || cleaned;
    }

    function findAsset(assetLabel?: string) {
      const wantedAsset = cleanImportValue(assetLabel).toLowerCase();

      if (!wantedAsset) {
        return { assetType: "", assetId: "", unresolvedAsset: "" };
      }

      const property = data.properties.find((property: any) => {
        const label = String(property.name ?? property.title ?? "").toLowerCase();
        return label && (label === wantedAsset || label.includes(wantedAsset) || wantedAsset.includes(label));
      });

      if (property) {
        return { assetType: "Property", assetId: property.id, unresolvedAsset: "" };
      }

      const vehicle = (data.vehicles ?? []).find((vehicle: any) => {
        const label = String(vehicle.name ?? `${vehicle.brand ?? ""} ${vehicle.model ?? ""}`).toLowerCase();
        return label && (label === wantedAsset || label.includes(wantedAsset) || wantedAsset.includes(label));
      });

      if (vehicle) {
        return { assetType: "Vehicle", assetId: vehicle.id, unresolvedAsset: "" };
      }

      const boat = (data.boats ?? []).find((boat: any) => {
        const label = String(boat.name ?? "").toLowerCase();
        return label && (label === wantedAsset || label.includes(wantedAsset) || wantedAsset.includes(label));
      });

      if (boat) {
        return { assetType: "Boat", assetId: boat.id, unresolvedAsset: "" };
      }

      return { assetType: "", assetId: "", unresolvedAsset: cleanImportValue(assetLabel) };
    }

    const today = new Date().toISOString().slice(0, 10);
    const rows = lines.map((line) => line.split("|").map((part) => part.trim()));

    let preview = "";
    let payload: any[] = [];

    if (type === "1") {
      payload = rows.map((parts) => {
        const [
          name,
          kind,
          clientLevel,
          preferredLanguage,
          relationshipStatus,
          email,
          phone,
          city,
          postalAddress,
          budget,
          source,
          preferences,
          importantNotes,
          notes
        ] = parts;

        return {
          id: crypto.randomUUID(),
          name: cleanImportValue(name),
          kind: cleanImportValue(kind) || "Client",
          clientLevel: cleanImportValue(clientLevel) || "Standard",
          preferredLanguage: cleanImportValue(preferredLanguage) || "Français",
          relationshipStatus: cleanImportValue(relationshipStatus) || "Prospect",
          email: cleanImportValue(email),
          phone: cleanImportValue(phone),
          city: cleanImportValue(city),
          postalAddress: cleanImportValue(postalAddress),
          budget: numberImportValue(budget),
          source: cleanImportValue(source) || "Import sécurisé",
          preferences: cleanImportValue(preferences),
          importantNotes: cleanImportValue(importantNotes),
          notes: cleanImportValue(notes),
          createdAt: today
        };
      }).filter((contact) => contact.name);

      preview = payload.slice(0, 5).map((item) => `- ${item.name} / ${item.email || "email à compléter"} / ${item.city || "ville à compléter"}`).join("\n");
    }

    if (type === "2") {
      payload = rows.map((parts) => {
        const [
          category,
          contactName,
          assetLabel,
          rentalStartDate,
          rentalEndDate,
          value,
          status,
          priority,
          dueDate,
          nextAction,
          notes
        ] = parts;

        const asset = findAsset(assetLabel);

        return {
          id: crypto.randomUUID(),
          category: cleanImportValue(category) || "Villa",
          contactName: cleanImportValue(contactName),
          assetType: asset.assetType,
          assetId: asset.assetId,
          status: cleanImportValue(status) || "Nouveau",
          value: numberImportValue(value),
          priority: cleanImportValue(priority) || "Moyenne",
          dueDate: dateImportValue(dueDate),
          nextAction: cleanImportValue(nextAction) || "Qualifier la demande.",
          notes: [asset.unresolvedAsset ? `Actif proposé : ${asset.unresolvedAsset}` : "", cleanImportValue(notes)].filter(Boolean).join("\n\n"),
          rentalStartDate: dateImportValue(rentalStartDate),
          rentalEndDate: dateImportValue(rentalEndDate)
        };
      }).filter((lead) => lead.contactName);

      preview = payload.slice(0, 5).map((item) => `- ${item.contactName} / ${item.category} / ${item.status}`).join("\n");
    }

    if (type === "3") {
      payload = rows.map((parts) => {
        const [name, propertyType, city, price, status, owner, notes] = parts;

        return {
          id: crypto.randomUUID(),
          name: cleanImportValue(name),
          type: cleanImportValue(propertyType) || "Villa",
          city: cleanImportValue(city),
          price: numberImportValue(price),
          status: cleanImportValue(status) || "Disponible",
          owner: cleanImportValue(owner),
          bedrooms: cleanImportValue(notes)?.match(/(\d+)\s*ch/i)?.[1] ? Number(cleanImportValue(notes).match(/(\d+)\s*ch/i)?.[1]) : 0,
          surface: 0,
          notes: cleanImportValue(notes),
          createdAt: today
        };
      }).filter((property) => property.name);

      preview = payload.slice(0, 5).map((item) => `- ${item.name} / ${item.city || "ville à compléter"} / ${item.status}`).join("\n");
    }

    if (type === "4") {
      payload = rows.map((parts) => {
        const [name, brand, model, city, price, status, owner, notes] = parts;

        return {
          id: crypto.randomUUID(),
          name: cleanImportValue(name),
          brand: cleanImportValue(brand),
          model: cleanImportValue(model),
          city: cleanImportValue(city),
          price: numberImportValue(price),
          status: cleanImportValue(status) || "Disponible",
          owner: cleanImportValue(owner),
          year: "",
          mileage: "",
          notes: cleanImportValue(notes),
          createdAt: today
        };
      }).filter((vehicle) => vehicle.name);

      preview = payload.slice(0, 5).map((item) => `- ${item.name} / ${item.city || "ville à compléter"} / ${item.status}`).join("\n");
    }

    if (type === "5") {
      payload = rows.map((parts) => {
        const [name, port, boatType, price, status, owner, notes] = parts;

        return {
          id: crypto.randomUUID(),
          name: cleanImportValue(name),
          port: cleanImportValue(port),
          type: cleanImportValue(boatType) || "Yacht",
          price: numberImportValue(price),
          status: cleanImportValue(status) || "Disponible",
          owner: cleanImportValue(owner),
          year: "",
          length: "",
          notes: cleanImportValue(notes),
          createdAt: today
        };
      }).filter((boat) => boat.name);

      preview = payload.slice(0, 5).map((item) => `- ${item.name} / ${item.port || "port à compléter"} / ${item.status}`).join("\n");
    }

    if (payload.length === 0) {
      window.alert("Import refusé : aucune donnée exploitable trouvée.");
      return;
    }

    const normalizeSafeImportDuplicate = (value?: string | number | null) =>
      String(value ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ");

    const safeImportDuplicateCount =
      type === "1"
        ? payload.filter((item) => {
            const name = normalizeSafeImportDuplicate(item.name);
            const email = normalizeSafeImportDuplicate(item.email);

            return data.contacts.some((existing) => {
              const sameName = name && normalizeSafeImportDuplicate(existing.name) === name;
              const sameEmail = email && normalizeSafeImportDuplicate(existing.email) === email;

              return sameName || sameEmail;
            });
          }).length
        : type === "2"
          ? payload.filter((item) => {
              const contactName = normalizeSafeImportDuplicate(item.contactName);
              const category = normalizeSafeImportDuplicate(item.category);
              const rentalStartDate = normalizeSafeImportDuplicate(item.rentalStartDate);
              const rentalEndDate = normalizeSafeImportDuplicate(item.rentalEndDate);

              return data.leads.some((existing) => {
                const sameContact = normalizeSafeImportDuplicate(existing.contactName) === contactName;
                const sameCategory = normalizeSafeImportDuplicate(existing.category) === category;
                const sameAsset = Boolean(item.assetId && existing.assetId && existing.assetId === item.assetId);
                const sameDates =
                  Boolean(rentalStartDate || rentalEndDate) &&
                  normalizeSafeImportDuplicate(existing.rentalStartDate) === rentalStartDate &&
                  normalizeSafeImportDuplicate(existing.rentalEndDate) === rentalEndDate;

                return sameContact && sameCategory && (sameAsset || sameDates);
              });
            }).length
          : type === "3"
            ? payload.filter((item) => {
                const name = normalizeSafeImportDuplicate(item.name);
                const city = normalizeSafeImportDuplicate(item.city);

                return data.properties.some((existing) => {
                  const sameName = normalizeSafeImportDuplicate(existing.name) === name;
                  const sameCity = !city || !existing.city || normalizeSafeImportDuplicate(existing.city) === city;

                  return sameName && sameCity;
                });
              }).length
            : type === "4"
              ? payload.filter((item) => {
                  const name = normalizeSafeImportDuplicate(item.name);
                  const city = normalizeSafeImportDuplicate(item.city);

                  return (data.vehicles ?? []).some((existing) => {
                    const sameName = normalizeSafeImportDuplicate(existing.name) === name;
                    const sameCity = !city || !existing.city || normalizeSafeImportDuplicate(existing.city) === city;

                    return sameName && sameCity;
                  });
                }).length
              : type === "5"
                ? payload.filter((item) => {
                    const name = normalizeSafeImportDuplicate(item.name);
                    const port = normalizeSafeImportDuplicate(item.port);

                    return (data.boats ?? []).some((existing) => {
                      const sameName = normalizeSafeImportDuplicate(existing.name) === name;
                      const samePort = !port || !existing.port || normalizeSafeImportDuplicate(existing.port) === port;

                      return sameName && samePort;
                    });
                  }).length
                : 0;

    if (safeImportDuplicateCount > 0) {
      const continueWithDuplicates = window.confirm(
        `${safeImportDuplicateCount} doublon(s) possible(s) détecté(s) dans cet import.\\n\\nContinuer quand même ?`
      );

      if (!continueWithDuplicates) return;
    }

    const confirmed = window.confirm(
      `Aperçu import sécurisé\n\nLignes valides : ${payload.length}\n\n${preview}\n\nConfirmer l’ajout ?\n\nAucune donnée existante ne sera écrasée.`
    );

    if (!confirmed) return;

    setData((current: any) => {
      if (type === "1") {
        return { ...current, contacts: [...payload, ...(current.contacts ?? [])] };
      }

      if (type === "2") {
        return { ...current, leads: [...payload, ...(current.leads ?? [])] };
      }

      if (type === "3") {
        return { ...current, properties: [...payload, ...(current.properties ?? [])] };
      }

      if (type === "4") {
        return { ...current, vehicles: [...payload, ...(current.vehicles ?? [])] };
      }

      if (type === "5") {
        return { ...current, boats: [...payload, ...(current.boats ?? [])] };
      }

      return current;
    });

    notify(`${payload.length} ligne(s) importée(s) sans écrasement.`);
  }

  function openQuickContactLeadPrompt() {
    const choice = window.prompt(
      "Ajouter rapidement :\n\n1 = Contact complet\n2 = Lead complet\n\nContact : Nom | Type | Niveau client | Langue préférée | Relation | Email | Téléphone | Ville | Adresse postale | Budget | Source | Préférences | Notes importantes | Notes\n\nLead : Catégorie | Contact | Actif proposé | Début réservation | Fin réservation | Valeur | Statut | Priorité | Échéance réponse | Prochaine action | Notes internes",
      "1"
    );

    if (!choice) return;

    const type = choice.trim();

    const contactExample =
      "Heily Aavik | Client | Standard | Français | Prospect | À compléter | À compléter | Super Cannes | À compléter | À compléter | Ancienne donnée récupérée | Villa Kanupi | Disponibilité Villa Kanupi à vérifier | Vérifier disponibilité du 11/07/2026 au 19/07/2026";

    const leadExample =
      "Villa | Heily Aavik | Villa Kanupi | 11/07/2026 | 19/07/2026 | À compléter | Nouveau | Moyenne | À compléter | Vérifier disponibilité Villa Kanupi et envoyer proposition privée | Budget, nombre de personnes et critères à compléter";

    const raw = window.prompt(
      type === "2"
        ? "Lead complet : Catégorie | Contact | Actif proposé | Début réservation | Fin réservation | Valeur | Statut | Priorité | Échéance réponse | Prochaine action | Notes internes"
        : "Contact complet : Nom | Type | Niveau client | Langue préférée | Relation | Email | Téléphone | Ville | Adresse postale | Budget | Source | Préférences | Notes importantes | Notes",
      type === "2" ? leadExample : contactExample
    );

    if (!raw) return;

    const parts = raw.split("|").map((part) => part.trim());

    function cleanExpressValue(value?: string) {
      const cleaned = String(value ?? "").trim();

      if (!cleaned || /à compléter|a completer|n\/a|na/i.test(cleaned)) {
        return "";
      }

      return cleaned;
    }

    function cleanExpressDate(value?: string) {
      const cleaned = cleanExpressValue(value);

      if (!cleaned) return "";

      return normalizeQuickEntryDate(cleaned) || cleaned;
    }

    if (type === "1") {
      const [
        name,
        kind,
        clientLevel,
        preferredLanguage,
        relationshipStatus,
        email,
        phone,
        city,
        postalAddress,
        budget,
        source,
        preferences,
        importantNotes,
        notes
      ] = parts;

      if (!cleanExpressValue(name)) {
        window.alert("Ajout refusé : nom du contact manquant.");
        return;
      }

      const contact = {
        id: crypto.randomUUID(),
        name: cleanExpressValue(name),
        kind: cleanExpressValue(kind) || "Client",
        clientLevel: cleanExpressValue(clientLevel) || "Standard",
        preferredLanguage: cleanExpressValue(preferredLanguage) || "Français",
        relationshipStatus: cleanExpressValue(relationshipStatus) || "Prospect",
        email: cleanExpressValue(email),
        phone: cleanExpressValue(phone),
        city: cleanExpressValue(city),
        postalAddress: cleanExpressValue(postalAddress),
        budget: parseExpressNumber(budget),
        source: cleanExpressValue(source) || "Ajout contact express",
        preferences: cleanExpressValue(preferences),
        importantNotes: cleanExpressValue(importantNotes),
        notes: cleanExpressValue(notes),
        createdAt: new Date().toISOString().slice(0, 10)
      } as any;

      if (!confirmDuplicateContact(contact as Contact)) return;

      setData((current: any) => ({
        ...current,
        contacts: [contact, ...(current.contacts ?? [])]
      }));

      notify("Contact complet ajouté en express.");
      return;
    }

    if (type === "2") {
      const [
        category,
        contactName,
        assetLabel,
        rentalStartDate,
        rentalEndDate,
        value,
        status,
        priority,
        dueDate,
        nextAction,
        notes
      ] = parts;

      if (!cleanExpressValue(contactName)) {
        window.alert("Ajout refusé : nom du contact manquant.");
        return;
      }

      const wantedAsset = cleanExpressValue(assetLabel).toLowerCase();
      let assetType = "";
      let assetId = "";

      if (wantedAsset) {
        const property = data.properties.find((property: any) => {
          const label = String(property.name ?? property.title ?? "").toLowerCase();
          return label && (label === wantedAsset || label.includes(wantedAsset) || wantedAsset.includes(label));
        });

        const vehicle = !property ? (data.vehicles ?? []).find((vehicle: any) => {
          const label = String(vehicle.name ?? `${vehicle.brand ?? ""} ${vehicle.model ?? ""}`).toLowerCase();
          return label && (label === wantedAsset || label.includes(wantedAsset) || wantedAsset.includes(label));
        }) : null;

        const boat = !property && !vehicle ? (data.boats ?? []).find((boat: any) => {
          const label = String(boat.name ?? "").toLowerCase();
          return label && (label === wantedAsset || label.includes(wantedAsset) || wantedAsset.includes(label));
        }) : null;

        if (property) {
          assetType = "Property";
          assetId = property.id;
        } else if (vehicle) {
          assetType = "Vehicle";
          assetId = vehicle.id;
        } else if (boat) {
          assetType = "Boat";
          assetId = boat.id;
        }
      }

      const leadNotes = [
        cleanExpressValue(assetLabel) && !assetId ? `Actif proposé : ${cleanExpressValue(assetLabel)}` : "",
        cleanExpressValue(notes)
      ].filter(Boolean).join("\n\n");

      const lead = {
        id: crypto.randomUUID(),
        category: cleanExpressValue(category) || "Villa",
        contactName: cleanExpressValue(contactName),
        assetType,
        assetId,
        status: cleanExpressValue(status) || "Nouveau",
        value: parseExpressNumber(value),
        priority: cleanExpressValue(priority) || "Moyenne",
        dueDate: cleanExpressDate(dueDate),
        nextAction: cleanExpressValue(nextAction) || "Qualifier la demande.",
        notes: leadNotes,
        rentalStartDate: cleanExpressDate(rentalStartDate),
        rentalEndDate: cleanExpressDate(rentalEndDate)
      } as any;

      if (!confirmDuplicateLead(lead as Lead)) return;

      setData((current: any) => ({
        ...current,
        leads: [lead, ...(current.leads ?? [])]
      }));

      notify("Lead complet ajouté en express.");
      return;
    }

    window.alert("Choix invalide. Utilise 1 pour Contact ou 2 pour Lead.");
  }

  function openQuickInventoryPrompt() {
    const choice = window.prompt(
      "Ajouter rapidement :\n\n1 = Bien / Villa\n2 = Voiture\n3 = Bateau / Yacht",
      "1"
    );

    if (!choice) return;

    const type = choice.trim();

    const examples: Record<string, string> = {
      "1": "Villa Kanupi | Villa | Super Cannes | 18000 | Disponible | Propriétaire à compléter | 5 chambres, piscine, vue mer",
      "2": "Range Rover Sport | Range Rover | Sport | Cannes | 450 | Disponible | Propriétaire à compléter | livraison possible",
      "3": "Yacht Princess 60 | Port Canto | Yacht | 3500 | Disponible | Propriétaire à compléter | journée charter"
    };

    const labels: Record<string, string> = {
      "1": "Format bien : Nom | Type | Ville | Prix | Statut | Propriétaire | Notes",
      "2": "Format voiture : Nom | Marque | Modèle | Ville | Prix/jour | Statut | Propriétaire | Notes",
      "3": "Format bateau : Nom | Port | Type | Prix/jour | Statut | Propriétaire | Notes"
    };

    const raw = window.prompt(
      `${labels[type] || labels["1"]}\n\nTu peux coller une seule ligne :`,
      examples[type] || examples["1"]
    );

    if (!raw) return;

    const parts = parseInventoryLine(raw);

    if (parts.length < 3) {
      window.alert("Ajout refusé : il manque des informations. Utilise les séparateurs |");
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const priceFrom = (value?: string) => Number(String(value ?? "").replace(/[^\d]/g, "")) || 0;

    if (type === "1") {
      const [name, propertyType, city, price, status, owner, notes] = parts;

      const property = {
        id: crypto.randomUUID(),
        name,
        type: propertyType || "Villa",
        city: city || "",
        price: priceFrom(price),
        status: status || "Disponible",
        owner: owner || "",
        bedrooms: notes?.match(/(\d+)\s*ch/i)?.[1] ? Number(notes.match(/(\d+)\s*ch/i)?.[1]) : 0,
        surface: 0,
        notes: notes || "",
        createdAt: today
      } as any;

      if (!property.name) {
        window.alert("Ajout refusé : nom du bien manquant.");
        return;
      }

      if (!confirmDuplicateAsset("bien", property)) return;

      setData((current: any) => ({
        ...current,
        properties: [property, ...(current.properties ?? [])]
      }));

      notify("Bien ajouté en express.");
      return;
    }

    if (type === "2") {
      const [name, brand, model, city, price, status, owner, notes] = parts;

      const vehicle = {
        id: crypto.randomUUID(),
        name,
        brand: brand || "",
        model: model || "",
        city: city || "",
        price: priceFrom(price),
        status: status || "Disponible",
        owner: owner || "",
        year: "",
        mileage: "",
        notes: notes || "",
        createdAt: today
      } as any;

      if (!vehicle.name) {
        window.alert("Ajout refusé : nom de la voiture manquant.");
        return;
      }

      if (!confirmDuplicateAsset("voiture", vehicle)) return;

      setData((current: any) => ({
        ...current,
        vehicles: [vehicle, ...(current.vehicles ?? [])]
      }));

      notify("Voiture ajoutée en express.");
      return;
    }

    if (type === "3") {
      const [name, port, boatType, price, status, owner, notes] = parts;

      const boat = {
        id: crypto.randomUUID(),
        name,
        port: port || "",
        type: boatType || "Yacht",
        price: priceFrom(price),
        status: status || "Disponible",
        owner: owner || "",
        year: "",
        length: "",
        notes: notes || "",
        createdAt: today
      } as any;

      if (!boat.name) {
        window.alert("Ajout refusé : nom du bateau manquant.");
        return;
      }

      if (!confirmDuplicateAsset("bateau", boat)) return;

      setData((current: any) => ({
        ...current,
        boats: [boat, ...(current.boats ?? [])]
      }));

      notify("Bateau ajouté en express.");
      return;
    }

    window.alert("Choix invalide. Utilise 1, 2 ou 3.");
  }

  function openQuickEntryPrompt() {
    const choice = window.prompt(
      "Choisis un modèle :\n\n1 = Villa\n2 = Bateau / Yacht\n3 = Voiture\n4 = Conciergerie\n5 = Texte libre",
      "1"
    );

    if (!choice) return;

    const templates: Record<string, string> = {
      "1": "Client : \nRecherche villa à \nDates : \nBudget : \nPersonnes : \nChambres : \nBesoin : villa, secteur, style, contraintes, services souhaités\nNote : ",
      "2": "Client : \nRecherche yacht / bateau\nPort / départ : \nDates : \nDurée : \nBudget : \nPersonnes : \nBesoin : taille, équipage, journée ou plusieurs jours, restauration, itinéraire\nNote : ",
      "3": "Client : \nRecherche voiture\nLieu de livraison : \nDates : \nBudget : \nModèle souhaité : \nBesoin : chauffeur ou sans chauffeur, assurance, livraison, restitution\nNote : ",
      "4": "Client : \nDemande conciergerie\nLieu : \nDates : \nBudget : \nBesoin : réservation, service maison, transport, événement, personnel, urgence\nNote : ",
      "5": "Client : \nRecherche : \nDates : \nBudget : \nBesoin : \nNote : "
    };

    const selectedTemplate = templates[choice.trim()] || templates["5"];

    const text = window.prompt(
      "Complète le modèle puis valide :",
      quickEntryText || selectedTemplate
    );

    if (!text) return;

    saveQuickEntryText(text);
  }

  function createQuickEntry() {
    saveQuickEntryText(quickEntryText);
  }


  async function saveCrmBackupToSupabase() {
    const currentData = data as any;

    const contactsCount = Array.isArray(currentData.contacts) ? currentData.contacts.length : 0;
    const leadsCount = Array.isArray(currentData.leads) ? currentData.leads.length : 0;
    const propertiesCount = Array.isArray(currentData.properties) ? currentData.properties.length : 0;
    const vehiclesCount = Array.isArray(currentData.vehicles) ? currentData.vehicles.length : 0;
    const boatsCount = Array.isArray(currentData.boats) ? currentData.boats.length : 0;
    const tasksCount = Array.isArray(currentData.tasks) ? currentData.tasks.length : 0;
    const quotesCount = Array.isArray(currentData.quotes) ? currentData.quotes.length : 0;

    const total =
      contactsCount +
      leadsCount +
      propertiesCount +
      vehiclesCount +
      boatsCount +
      tasksCount +
      quotesCount;

    if (total === 0) {
      window.alert("Sauvegarde refusée : le CRM est vide.");
      return;
    }

    const confirmed = window.confirm(
      `Créer une sauvegarde Supabase ?\n\nContacts: ${contactsCount}\nLeads: ${leadsCount}\nBiens: ${propertiesCount}\nVoitures: ${vehiclesCount}\nBateaux: ${boatsCount}\nTâches: ${tasksCount}\nDevis: ${quotesCount}`
    );

    if (!confirmed) return;

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      window.alert("Sauvegarde impossible : utilisateur Supabase non connecté.");
      return;
    }

    const payload = {
      version: "oneaddress-riviera-crm-v1",
      savedAt: new Date().toISOString(),
      data: currentData
    };

    const { error } = await supabase.from("crm_backups").insert({
      user_id: userData.user.id,
      payload,
      contacts_count: contactsCount,
      leads_count: leadsCount,
      properties_count: propertiesCount,
      vehicles_count: vehiclesCount,
      boats_count: boatsCount,
      tasks_count: tasksCount,
      quotes_count: quotesCount
    });

    if (error) {
      window.alert(`Erreur sauvegarde Supabase : ${error.message}`);
      return;
    }

    window.alert("Sauvegarde Supabase créée.");
  }

  function exportJson() {
    const exportPayload = {
      ...data,
      quotes: loadSavedQuotes()
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `oneaddress-riviera-crm-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    notify("Export JSON téléchargé.");
  }

  function addContact(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const contact: Contact = {
      id: makeId("c"),
      name: String(form.get("name") ?? "").trim(),
      kind: String(form.get("kind") ?? "Client") as ContactKind,
      email: String(form.get("email") ?? "").trim(),
      phone: String(form.get("phone") ?? "").trim(),
      city: String(form.get("city") ?? "").trim(),
      postalAddress: String(form.get("postalAddress") ?? "").trim(),
      budget: safeNumber(form.get("budget")),
      source: String(form.get("source") ?? "").trim() || "Direct",
      notes: String(form.get("notes") ?? "").trim(),
      clientLevel: String(form.get("clientLevel") ?? "Standard") as NonNullable<Contact["clientLevel"]>,
      preferredLanguage: String(form.get("preferredLanguage") ?? "Français") as NonNullable<Contact["preferredLanguage"]>,
      relationshipStatus: String(form.get("relationshipStatus") ?? "Prospect") as NonNullable<Contact["relationshipStatus"]>,
      preferences: String(form.get("preferences") ?? "").trim(),
      importantNotes: String(form.get("importantNotes") ?? "").trim(),
      createdAt: new Date().toISOString().slice(0, 10)
    };
    if (!contact.name) return notify("Ajoutez au minimum un nom de contact.", "warning");
    if (!confirmDuplicateContact(contact)) return;
    setData((current) => ({ ...current, contacts: [contact, ...current.contacts] }));
    event.currentTarget.reset();
    notify("Contact ajouté.");
  }

  function addLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const assetSelection = parseAssetKey(form.get("assetKey"));

    const lead: Lead = {
      id: makeId("l"),
      category: String(form.get("category") ?? "Villa") as Lead["category"],
      contactName: String(form.get("contactName") ?? "").trim(),
      assetType: assetSelection.assetType,
      assetId: assetSelection.assetId,
      status: String(form.get("status") ?? "Nouveau") as LeadStatus,
      value: safeNumber(form.get("value")),
      priority: String(form.get("priority") ?? "Moyenne") as Lead["priority"],
      nextAction: String(form.get("nextAction") ?? "").trim(),
      dueDate: String(form.get("dueDate") ?? ""),
      rentalStartDate: String(form.get("rentalStartDate") ?? ""),
      rentalEndDate: String(form.get("rentalEndDate") ?? ""),
      notes: String(form.get("notes") ?? "").trim()
    };

    if (!lead.contactName) return notify("Sélectionnez un contact pour ce lead.", "warning");
    if (!confirmDuplicateLead(lead)) return;

    setData((current) => ({ ...current, leads: [lead, ...current.leads] }));
    event.currentTarget.reset();
    setLeadDraftContactName("");
    notify("Lead ajouté au pipeline.");
  }

  function addProperty(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const property: Property = {
      id: makeId("p"),
      name: String(form.get("name") ?? "").trim(),
      city: String(form.get("city") ?? "").trim(),
      type: String(form.get("type") ?? "Villa").trim(),
      price: safeNumber(form.get("price")),
      status: String(form.get("status") ?? "Disponible") as PropertyStatus,
      owner: String(form.get("owner") ?? "").trim(),
      bedrooms: safeNumber(form.get("bedrooms")),
      surface: safeNumber(form.get("surface"))
    };
    if (!property.name) return notify("Ajoutez au minimum un nom de bien.", "warning");
    if (!confirmDuplicateAsset("bien", property)) return;
    setData((current) => ({ ...current, properties: [property, ...current.properties] }));
    event.currentTarget.reset();
    notify("Bien ajouté.");
  }

  function addVehicle(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const vehicle: Vehicle = {
      id: makeId("v"),
      name: String(form.get("name") ?? "").trim(),
      brand: String(form.get("brand") ?? "").trim(),
      model: String(form.get("model") ?? "").trim(),
      city: String(form.get("city") ?? "").trim(),
      price: safeNumber(form.get("price")),
      status: String(form.get("status") ?? "Disponible") as VehicleStatus,
      owner: String(form.get("owner") ?? "").trim(),
      year: safeNumber(form.get("year")),
      mileage: safeNumber(form.get("mileage"))
    };
    if (!vehicle.name) return notify("Ajoutez au minimum un nom de voiture.", "warning");
    if (!confirmDuplicateAsset("voiture", vehicle)) return;
    setData((current) => ({ ...current, vehicles: [vehicle, ...(current.vehicles ?? [])] }));
    event.currentTarget.reset();
    notify("Voiture ajoutée.");
  }

  function addBoat(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const boat: Boat = {
      id: makeId("b"),
      name: String(form.get("name") ?? "").trim(),
      port: String(form.get("port") ?? "").trim(),
      type: String(form.get("type") ?? "Yacht").trim(),
      price: safeNumber(form.get("price")),
      status: String(form.get("status") ?? "Disponible") as BoatStatus,
      owner: String(form.get("owner") ?? "").trim(),
      year: safeNumber(form.get("year")),
      length: safeNumber(form.get("length"))
    };
    if (!boat.name) return notify("Ajoutez au minimum un nom de bateau.", "warning");
    if (!confirmDuplicateAsset("bateau", boat)) return;
    setData((current) => ({ ...current, boats: [boat, ...(current.boats ?? [])] }));
    event.currentTarget.reset();
    notify("Bateau ajouté.");
  }

  function updateProperty(updatedProperty: Property) {
    setData((current) => ({
      ...current,
      properties: current.properties.map((property) =>
        property.id === updatedProperty.id ? updatedProperty : property
      )
    }));

    notify("Bien mis à jour.");
  }

  function updateVehicle(updatedVehicle: Vehicle) {
    setData((current) => ({
      ...current,
      vehicles: (current.vehicles ?? []).map((vehicle) =>
        vehicle.id === updatedVehicle.id ? updatedVehicle : vehicle
      )
    }));

    notify("Voiture mise à jour.");
  }

  function updateBoat(updatedBoat: Boat) {
    setData((current) => ({
      ...current,
      boats: (current.boats ?? []).map((boat) =>
        boat.id === updatedBoat.id ? updatedBoat : boat
      )
    }));

    notify("Bateau mis à jour.");
  }

  function addTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const task: Task = {
      id: makeId("t"),
      title: String(form.get("title") ?? "").trim(),
      owner: String(form.get("owner") ?? "Matteo").trim(),
      status: String(form.get("status") ?? "À faire") as TaskStatus,
      dueDate: String(form.get("dueDate") ?? ""),
      linkedTo: String(form.get("linkedTo") ?? "").trim()
    };
    if (!task.title) return notify("Ajoutez au minimum un titre de tâche.", "warning");
    setData((current) => ({ ...current, tasks: [task, ...current.tasks] }));
    event.currentTarget.reset();
    setTaskDraftLeadId("");
    setTaskDraftTitle("");
    notify("Tâche ajoutée.");
  }

  function updateLead(updatedLead: Lead) {
    setData((current) => ({
      ...current,
      leads: current.leads.map((lead) =>
        lead.id === updatedLead.id ? updatedLead : lead
      )
    }));

    notify("Lead mis à jour.");
  }

  function updateLeadStatus(id: string, status: LeadStatus) {
    setData((current) => ({
      ...current,
      leads: current.leads.map((lead) => (lead.id === id ? { ...lead, status } : lead))
    }));
  }

  function createQuoteDraftFromLead(lead: Lead) {
    const property = lead.assetType === "Property"
      ? data.properties.find((item) => item.id === lead.assetId)
      : undefined;

    const vehicle = lead.assetType === "Vehicle"
      ? (data.vehicles ?? []).find((item) => item.id === lead.assetId)
      : undefined;

    const boat = lead.assetType === "Boat"
      ? (data.boats ?? []).find((item) => item.id === lead.assetId)
      : undefined;

    const vehicleLabel = vehicle
      ? vehicle.name || `${vehicle.brand} ${vehicle.model}`.trim()
      : "";

    const assetLabel = property
      ? getPropertyDisplayName(property)
      : vehicleLabel || boat?.name || "";

    const location = property?.city || vehicle?.city || boat?.port || "";

    const category =
      lead.assetType === "Boat"
        ? "Bateau"
        : lead.assetType === "Vehicle"
          ? "Voiture"
          : lead.category || "Villa";

    const title = assetLabel
      ? `${category} · ${assetLabel}`
      : `${category} · ${lead.contactName}`;

    const notes = [
      lead.nextAction ? `Next action: ${lead.nextAction}` : "",
      lead.notes ? `Client request / internal notes: ${lead.notes}` : ""
    ].filter(Boolean).join("\n\n");

    setQuoteDraftFromLead({
      key: `${lead.id}-${Date.now()}`,
      clientName: lead.contactName,
      category,
      title,
      location,
      startDate: lead.rentalStartDate || "",
      endDate: lead.rentalEndDate || "",
      unitPrice: lead.value || 0,
      notes
    });

    setActiveTab("quotes");

    window.setTimeout(() => {
      document.querySelector<HTMLFormElement>('form[data-quote-form="true"]')?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 160);

    notify(`Devis prêt pour ${lead.contactName}.`);
  }


  function createTaskDraftFromFollowUp(recommendation: FollowUpRecommendation) {
    setTaskDraftLeadId(recommendation.leadId ?? "");
    setTaskDraftTitle(recommendation.title);
    setActiveTab("tasks");

    window.setTimeout(() => {
      document.getElementById("task-create-form")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 120);

    notify("Tâche de relance prête.");
  }


  function updateTask(updatedTask: Task) {
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === updatedTask.id ? updatedTask : task
      )
    }));

    notify("Tâche mise à jour.");
  }

  function updateTaskStatus(id: string, status: TaskStatus) {
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((task) => (task.id === id ? { ...task, status } : task))
    }));
  }

  function updateContact(updatedContact: Contact) {
    setData((current) => ({
      ...current,
      contacts: current.contacts.map((contact) =>
        contact.id === updatedContact.id ? updatedContact : contact
      )
    }));

    notify("Contact mis à jour.");
  }

  function deleteContact(id: string) {
    setData((current) => ({ ...current, contacts: current.contacts.filter((contact) => contact.id !== id) }));
    notify("Contact supprimé.");
  }

  function deleteLead(id: string) {
    setData((current) => ({ ...current, leads: current.leads.filter((lead) => lead.id !== id) }));
    notify("Lead supprimé.");
  }

  function deleteProperty(id: string) {
    const property = data.properties.find((item) => item.id === id);
    const label = property ? getPropertyDisplayName(property) : "ce bien";
    const confirmed = window.confirm(`Supprimer définitivement "${label}" ?`);

    if (!confirmed) return;

    setData((current) => ({ ...current, properties: current.properties.filter((property) => property.id !== id) }));
    notify("Bien supprimé.");
  }

  function deleteVehicle(id: string) {
    const vehicle = (data.vehicles ?? []).find((item) => item.id === id);
    const label = vehicle?.name || "cette voiture";
    const confirmed = window.confirm(`Supprimer définitivement "${label}" ?`);

    if (!confirmed) return;

    setData((current) => ({ ...current, vehicles: (current.vehicles ?? []).filter((vehicle) => vehicle.id !== id) }));
    notify("Voiture supprimée.");
  }

  function deleteBoat(id: string) {
    const boat = (data.boats ?? []).find((item) => item.id === id);
    const label = boat?.name || "ce bateau";
    const confirmed = window.confirm(`Supprimer définitivement "${label}" ?`);

    if (!confirmed) return;

    setData((current) => ({ ...current, boats: (current.boats ?? []).filter((boat) => boat.id !== id) }));
    notify("Bateau supprimé.");
  }

  function deleteTask(id: string) {
    setData((current) => ({ ...current, tasks: current.tasks.filter((task) => task.id !== id) }));
    notify("Tâche supprimée.");
  }


  function handleImportJson(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (!file) return;

    const confirmed = window.confirm(
      "Importer ce fichier JSON va remplacer/compléter les données actuelles du CRM. Continuer ?"
    );

    if (!confirmed) {
      input.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));

        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Format JSON invalide.");
        }

        const knownKeys = ["contacts", "leads", "properties", "vehicles", "boats", "tasks", "quotes"];
        const hasKnownData = knownKeys.some((key) => Array.isArray((parsed as Record<string, unknown>)[key]));

        if (!hasKnownData) {
          throw new Error("Ce fichier ne ressemble pas à une sauvegarde CRM.");
        }

        const nextData = {
          ...data,
          ...(parsed as Partial<CRMData>)
        } as CRMData;

        setData(nextData);

        if (Array.isArray((parsed as { quotes?: unknown }).quotes)) {
          const importedDeviss = ((parsed as { quotes?: unknown }).quotes as unknown[])
            .map(normalizeQuoteRequest)
            .filter((quote): quote is QuoteRequest => Boolean(quote));

          saveQuotesToBrowser(importedDeviss);
        }

        window.alert("Import JSON réussi. Recharge la page pour afficher les devis restaurés.");
      } catch (error) {
        window.alert("Import impossible : le fichier JSON n’est pas valide.");
      } finally {
        input.value = "";
      }
    };

    reader.readAsText(file);
  }

  return (
    <main className="crm-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">OA</div>
          <div>
            <p className="eyebrow">OneAddress</p>
            <h1>Riviera CRM</h1>
          </div>
        </div>

        <nav className="nav-list" aria-label="Navigation principale">
        <NavButton label="Dashboard" icon="⌂" active={activeTab === "dashboard"} onClick={() => setActiveTab("dashboard")} />
        <NavButton label="Contacts" icon="👤" active={activeTab === "contacts"} onClick={() => setActiveTab("contacts")} />
        <NavButton label="Leads" icon="🎯" active={activeTab === "leads"} onClick={() => setActiveTab("leads")} />
        <NavButton label="Tâches" icon="✓" active={activeTab === "tasks"} onClick={() => setActiveTab("tasks")} />
        <NavButton label="Devis" icon="🧾" active={activeTab === "quotes"} onClick={() => setActiveTab("quotes")} />
        <NavButton label="Planning" icon="🗓" active={activeTab === "planning"} onClick={() => setActiveTab("planning")} />
        <NavButton label="Biens" icon="🏠" active={activeTab === "properties"} onClick={() => setActiveTab("properties")} />
        <NavButton label="Voitures" icon="🚗" active={activeTab === "vehicles"} onClick={() => setActiveTab("vehicles")} />
        <NavButton label="Bateaux" icon="🛥" active={activeTab === "boats"} onClick={() => setActiveTab("boats")} />
        </nav>

        <div className="sidebar-card">
          <p className="eyebrow">MVP</p>
          <strong>Sauvegardes</strong>
          <span>Utilisez Backup fichier et Sauvegarde cloud après chaque lot d’ajouts. Prêt à connecter une DB ensuite.</span>
        </div>
      </aside>

      <section className="content-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">CRM interne</p>
            <h2>{titleForTab(activeTab)}</h2>
          </div>
          <div className="topbar-actions">
<input
              className="search-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher client, bien, lead..."
              aria-label="Recherche"
            />
            <span className="muted-line">Connecté : {sessionEmail}</span>
            <button className="secondary-button" type="button" onClick={onLogout}>Déconnexion</button>
            <button className="secondary-button" type="button" onClick={openSafeCsvImportPrompt}>Import sécurisé</button>
            <button className="secondary-button" onClick={exportJson}>Backup fichier</button>
            <button className="secondary-button" type="button" onClick={saveCrmBackupToSupabase}>Sauvegarde cloud</button>
            
            <button className="secondary-button" onClick={() => {
            exportCRMAsCsv(data);
            notify("Export CSV téléchargé.");
          }}>Export CSV</button>
          </div>
        </header>

        {activeTab === "dashboard" && (
          <>
            <Dashboard
              stats={stats}
              data={data}
              onLeadStatusChange={updateLeadStatus}
              onTaskStatusChange={updateTaskStatus}
              onStartMessage={openQuickEntryPrompt}
              onStartContactLead={openQuickContactLeadPrompt}
              onStartInventory={openQuickInventoryPrompt}
              onShowLeads={() => setActiveTab("leads")}
              onCloudBackup={saveCrmBackupToSupabase}
            />

            <FollowUpsPanel
              leads={data.leads}
              tasks={data.tasks}
              quotes={loadSavedQuotes()}
              onCreateTask={createTaskDraftFromFollowUp}
            />
          </>
        )}

        {activeTab === "contacts" && (
          <ContactsView contacts={filteredContacts} leads={data.leads} tasks={data.tasks} onAdd={addContact} onUpdate={updateContact} onDelete={deleteContact} onCreateLead={(contactName) => {
                  setLeadDraftContactName(contactName);
                  setActiveTab("leads");

                  window.setTimeout(() => {
                    document.getElementById("lead-create-form")?.scrollIntoView({
                      behavior: "smooth",
                      block: "start"
                    });
                  }, 120);

                  notify(`Lead prêt pour ${contactName}.`);
                }} onCreateTask={(contactName) => {
                  setTaskDraftLeadId("");
                  setTaskDraftTitle(`Relancer ${contactName}`);
                  setActiveTab("tasks");

                  window.setTimeout(() => {
                    document.getElementById("task-create-form")?.scrollIntoView({
                      behavior: "smooth",
                      block: "start"
                    });
                  }, 120);

                  notify(`Tâche prête pour ${contactName}.`);
                }} />
        )}

        {activeTab === "quotes" && <QuotesView contacts={data.contacts} prefilledLead={quoteDraftFromLead} />}

        {activeTab === "planning" && (
          <PlanningView
            leads={data.leads}
            properties={data.properties}
            vehicles={data.vehicles ?? []}
            boats={data.boats ?? []}
          />
        )}

        {activeTab === "leads" && (
          <LeadsView leads={filteredLeads} contacts={data.contacts} tasks={data.tasks} properties={data.properties} vehicles={data.vehicles ?? []} boats={data.boats ?? []} preselectedContactName={leadDraftContactName} onAdd={addLead} onUpdate={updateLead} onStatusChange={updateLeadStatus} onDelete={deleteLead} onCreateQuote={createQuoteDraftFromLead} onCreateTask={(lead: Lead) => {
                  setTaskDraftLeadId(lead.id);
                  setTaskDraftTitle(lead.nextAction || `Relancer ${lead.contactName}`);
                  setActiveTab("tasks");

                  window.setTimeout(() => {
                    document.getElementById("task-create-form")?.scrollIntoView({
                      behavior: "smooth",
                      block: "start"
                    });
                  }, 120);

                  notify(`Tâche prête pour ${lead.contactName}.`);
                }} />
        )}

        {activeTab === "properties" && (
          <PropertiesView properties={filteredProperties} leads={data.leads} onAdd={addProperty} onUpdate={updateProperty} onDelete={deleteProperty} />
        )}

        {activeTab === "vehicles" && (
          <VehiclesView vehicles={filteredVehicles} leads={data.leads} onAdd={addVehicle} onUpdate={updateVehicle} onDelete={deleteVehicle} />
        )}

        {activeTab === "boats" && (
          <BoatsView boats={filteredBoats} leads={data.leads} onAdd={addBoat} onUpdate={updateBoat} onDelete={deleteBoat} />
        )}

        {activeTab === "tasks" && (
          <TasksView tasks={filteredTasks} leads={data.leads} preselectedLeadId={taskDraftLeadId} prefilledTitle={taskDraftTitle} onAdd={addTask} onUpdate={updateTask} onStatusChange={updateTaskStatus} onDelete={deleteTask} />
        )}
      </section>

      {toast && <div className={`toast ${toast.tone}`}>{toast.message}</div>}
    </main>
  );
}

function NavButton({ label, icon, active, onClick }: { label: string; icon: string; active: boolean; onClick: () => void }) {
  return (
    <button className={`nav-button ${active ? "active" : ""}`} onClick={onClick}>
      <span>{icon}</span>
      {label}
    </button>
  );
}

function titleForTab(tab: Tab) {
  const titles: Record<Tab, string> = {
    dashboard: "Vue d'ensemble",
    contacts: "Contacts",
    leads: "Pipeline leads",
    tasks: "Tâches",
    quotes: "Devis",
    planning: "Planning",
    properties: "Biens",
    vehicles: "Voitures",
    boats: "Bateaux"
  };
  return titles[tab];
}

function searchMatch(query: string, fields: Array<string | number>) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((field) => String(field).toLowerCase().includes(needle));
}


type PlanningAsset = {
  id: string;
  type: "Property" | "Vehicle" | "Boat";
  label: string;
  category: string;
  location: string;
};

function isValidPlanningDate(value?: string) {
  if (!value) return false;

  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime());
}

function planningDateValue(value: string) {
  return new Date(`${value}T00:00:00`).getTime();
}

function planningRangesOverlap(startA: string, endA: string, startB: string, endB: string) {
  if (!isValidPlanningDate(startA) || !isValidPlanningDate(endA) || !isValidPlanningDate(startB) || !isValidPlanningDate(endB)) {
    return false;
  }

  return planningDateValue(startA) <= planningDateValue(endB) && planningDateValue(startB) <= planningDateValue(endA);
}

function formatPlanningDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatPlanningMonthValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

function getPlanningMonthTitle(monthValue: string) {
  const [yearText, monthText] = monthValue.split("-");
  const year = Number(yearText);
  const month = Number(monthText);

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return "Mois invalide";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric"
  }).format(new Date(year, month - 1, 1));
}

function getPlanningCalendarWeeks(monthValue: string) {
  const [yearText, monthText] = monthValue.split("-");
  const today = new Date();

  const year = Number.isFinite(Number(yearText)) ? Number(yearText) : today.getFullYear();
  const monthIndex = Number.isFinite(Number(monthText)) ? Number(monthText) - 1 : today.getMonth();

  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);

  const leadingEmptyDays = (firstDay.getDay() + 6) % 7;
  const cells: Array<{ iso: string; day: number } | null> = Array.from({ length: leadingEmptyDays }, () => null);

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    const date = new Date(year, monthIndex, day);
    cells.push({
      iso: formatPlanningDateValue(date),
      day
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  const weeks: Array<Array<{ iso: string; day: number } | null>> = [];

  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }

  return weeks;
}

function PlanningView({
  leads,
  properties,
  vehicles,
  boats
}: {
  leads: Lead[];
  properties: Property[];
  vehicles: Vehicle[];
  boats: Boat[];
}) {
  const [categoryFilter, setCategoryFilter] = useState("Tous");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => formatPlanningMonthValue(new Date()));

  const assets = useMemo<PlanningAsset[]>(() => {
    return [
      ...properties.map((property) => ({
        id: property.id,
        type: "Property" as const,
        label: getPropertyDisplayName(property),
        category: property.type || "Bien",
        location: property.city || "Lieu non renseigné"
      })),
      ...vehicles.map((vehicle) => ({
        id: vehicle.id,
        type: "Vehicle" as const,
        label: vehicle.name || `${vehicle.brand} ${vehicle.model}`.trim() || "Voiture sans nom",
        category: "Voiture",
        location: vehicle.city || "Lieu non renseigné"
      })),
      ...boats.map((boat) => ({
        id: boat.id,
        type: "Boat" as const,
        label: boat.name || "Bateau sans nom",
        category: "Bateau",
        location: boat.port || "Port non renseigné"
      }))
    ];
  }, [properties, vehicles, boats]);

  const confirmedBookings = useMemo(() => {
    return leads
      .filter((lead) =>
        lead.status === "Gagné" &&
        Boolean(lead.assetType) &&
        Boolean(lead.assetId) &&
        isValidPlanningDate(lead.rentalStartDate) &&
        isValidPlanningDate(lead.rentalEndDate)
      )
      .map((lead) => {
        const asset = assets.find((item) => item.type === lead.assetType && item.id === lead.assetId);

        return {
          id: lead.id,
          assetType: lead.assetType,
          assetId: lead.assetId,
          assetLabel: asset?.label ?? String(lead.assetId ?? "Actif non renseigné"),
          assetCategory: asset?.category ?? lead.category,
          contactName: lead.contactName,
          startDate: lead.rentalStartDate,
          endDate: lead.rentalEndDate,
          value: lead.value,
          nextAction: lead.nextAction
        };
      })
      .sort((a, b) => planningDateValue(a.startDate) - planningDateValue(b.startDate));
  }, [leads, assets]);

  const pendingBookings = useMemo(() => {
    return leads
      .filter((lead) =>
        lead.status !== "Gagné" &&
        lead.status !== "Perdu" &&
        Boolean(lead.assetType) &&
        Boolean(lead.assetId) &&
        isValidPlanningDate(lead.rentalStartDate) &&
        isValidPlanningDate(lead.rentalEndDate)
      )
      .map((lead) => {
        const asset = assets.find((item) => item.type === lead.assetType && item.id === lead.assetId);

        return {
          id: lead.id,
          status: lead.status,
          assetType: lead.assetType,
          assetId: lead.assetId,
          assetLabel: asset?.label ?? String(lead.assetId ?? "Actif non renseigné"),
          assetCategory: asset?.category ?? lead.category,
          contactName: lead.contactName,
          startDate: lead.rentalStartDate,
          endDate: lead.rentalEndDate,
          value: lead.value,
          nextAction: lead.nextAction
        };
      })
      .sort((a, b) => planningDateValue(a.startDate) - planningDateValue(b.startDate));
  }, [leads, assets]);

  const visibleAssets = assets.filter((asset) => {
    if (categoryFilter === "Tous") return true;
    return asset.category === categoryFilter;
  });

  const selectedStartDate = startDate;
  const selectedEndDate = endDate || startDate;
  const hasSelectedPeriod = isValidPlanningDate(selectedStartDate) && isValidPlanningDate(selectedEndDate);

  function getBookingsForAsset(asset: PlanningAsset) {
    return confirmedBookings.filter((booking) => booking.assetType === asset.type && booking.assetId === asset.id);
  }

  function getOptionsForAsset(asset: PlanningAsset) {
    return pendingBookings.filter((booking) => booking.assetType === asset.type && booking.assetId === asset.id);
  }

  function getAvailabilityLabel(asset: PlanningAsset) {
    if (!hasSelectedPeriod) return "Choisissez des dates";

    const hasConfirmedOverlap = getBookingsForAsset(asset).some((booking) =>
      planningRangesOverlap(selectedStartDate, selectedEndDate, booking.startDate, booking.endDate)
    );

    if (hasConfirmedOverlap) return "Occupé";

    const hasOptionOverlap = getOptionsForAsset(asset).some((booking) =>
      planningRangesOverlap(selectedStartDate, selectedEndDate, booking.startDate, booking.endDate)
    );

    return hasOptionOverlap ? "Option" : "Disponible";
  }

  const categories = ["Tous", ...Array.from(new Set(assets.map((asset) => asset.category))).sort()];
  const calendarWeeks = useMemo(() => getPlanningCalendarWeeks(calendarMonth), [calendarMonth]);
  const calendarWeekDays = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

  const calendarEvents = useMemo(() => {
    return [
      ...confirmedBookings.map((booking) => ({
        ...booking,
        planningLabel: "Confirmé"
      })),
      ...pendingBookings.map((booking) => ({
        ...booking,
        planningLabel: booking.status
      }))
    ].sort((a, b) => planningDateValue(a.startDate) - planningDateValue(b.startDate));
  }, [confirmedBookings, pendingBookings]);

  const planningConflicts = useMemo(() => {
    const usableLeads = leads
      .filter((lead) =>
        lead.status !== "Perdu" &&
        Boolean(lead.assetType) &&
        Boolean(lead.assetId) &&
        isValidPlanningDate(lead.rentalStartDate) &&
        isValidPlanningDate(lead.rentalEndDate)
      )
      .map((lead) => {
        const asset = assets.find((item) => item.type === lead.assetType && item.id === lead.assetId);

        return {
          id: lead.id,
          status: lead.status,
          assetType: lead.assetType,
          assetId: lead.assetId,
          assetLabel: asset?.label ?? String(lead.assetId ?? "Actif non renseigné"),
          contactName: lead.contactName,
          startDate: lead.rentalStartDate,
          endDate: lead.rentalEndDate,
          value: lead.value
        };
      });

    const conflicts: Array<{
      key: string;
      assetLabel: string;
      firstContact: string;
      secondContact: string;
      firstStatus: LeadStatus;
      secondStatus: LeadStatus;
      firstDates: string;
      secondDates: string;
      severity: string;
    }> = [];

    for (let index = 0; index < usableLeads.length; index += 1) {
      const first = usableLeads[index];

      for (let nextIndex = index + 1; nextIndex < usableLeads.length; nextIndex += 1) {
        const second = usableLeads[nextIndex];

        if (first.assetType !== second.assetType || first.assetId !== second.assetId) {
          continue;
        }

        const overlaps = planningRangesOverlap(
          first.startDate,
          first.endDate,
          second.startDate,
          second.endDate
        );

        if (!overlaps) {
          continue;
        }

        const hasConfirmed = first.status === "Gagné" || second.status === "Gagné";

        conflicts.push({
          key: `${first.id}-${second.id}`,
          assetLabel: first.assetLabel,
          firstContact: first.contactName,
          secondContact: second.contactName,
          firstStatus: first.status,
          secondStatus: second.status,
          firstDates: `${formatDateFR(first.startDate)} → ${formatDateFR(first.endDate)}`,
          secondDates: `${formatDateFR(second.startDate)} → ${formatDateFR(second.endDate)}`,
          severity: hasConfirmed ? "Conflit confirmé" : "Conflit option"
        });
      }
    }

    return conflicts;
  }, [leads, assets]);

  function getEventsForCalendarDay(dayIso: string) {
    return calendarEvents.filter((event) =>
      planningRangesOverlap(dayIso, dayIso, event.startDate, event.endDate)
    );
  }

  function moveCalendarMonth(offset: number) {
    const [yearText, monthText] = calendarMonth.split("-");
    const year = Number(yearText);
    const month = Number(monthText);

    if (!Number.isFinite(year) || !Number.isFinite(month)) return;

    setCalendarMonth(formatPlanningMonthValue(new Date(year, month - 1 + offset, 1)));
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Planning</p>
            <h3>Disponibilités & locations confirmées</h3>
          </div>
        </div>

        <form className="form-grid compact">
          <label>Catégorie
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              {categories.map((category) => (
                <option key={category}>{category}</option>
              ))}
            </select>
          </label>

          <label>Date début
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>

          <label>Date fin
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>

          <button
            className="ghost-button"
            type="button"
            onClick={() => {
              setCategoryFilter("Tous");
              setStartDate("");
              setEndDate("");
            }}
          >
            Reset
          </button>
        </form>
      </section>

      <section className="card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Conflits planning</p>
            <h3>{planningConflicts.length} conflit{planningConflicts.length > 1 ? "s" : ""} détecté{planningConflicts.length > 1 ? "s" : ""}</h3>
          </div>
        </div>

        <div className="list-stack">
          {planningConflicts.length === 0 ? (
            <p className="muted-line">Aucun conflit détecté sur les actifs liés aux leads.</p>
          ) : (
            planningConflicts.map((conflict) => (
              <article className="mini-row" key={conflict.key}>
                <div>
                  <strong>{conflict.assetLabel}</strong>
                  <span>{conflict.firstContact} · {conflict.firstDates} · {conflict.firstStatus}</span>
                  <span>{conflict.secondContact} · {conflict.secondDates} · {conflict.secondStatus}</span>
                </div>
                <Badge>{conflict.severity}</Badge>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Calendrier mensuel</p>
            <h3>{getPlanningMonthTitle(calendarMonth)}</h3>
          </div>

          <div className="quote-actions">
            <button className="ghost-button" type="button" onClick={() => moveCalendarMonth(-1)}>
              Mois précédent
            </button>

            <button className="ghost-button" type="button" onClick={() => moveCalendarMonth(1)}>
              Mois suivant
            </button>
          </div>
        </div>

        <form className="form-grid compact">
          <label>Mois
            <input type="month" value={calendarMonth} onChange={(event) => setCalendarMonth(event.target.value)} />
          </label>
        </form>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {calendarWeekDays.map((day) => (
                  <th key={day}>{day}</th>
                ))}
              </tr>
            </thead>

            <tbody>
              {calendarWeeks.map((week, weekIndex) => (
                <tr key={`week-${weekIndex}`}>
                  {week.map((day, dayIndex) => {
                    const events = day ? getEventsForCalendarDay(day.iso) : [];

                    return (
                      <td key={`${weekIndex}-${dayIndex}`}>
                        {day ? (
                          <div>
                            <strong>{day.day}</strong>

                            {events.length === 0 ? (
                              <span className="muted-line">Disponible</span>
                            ) : (
                              events.slice(0, 4).map((event) => (
                                <span className="muted-line" key={event.id}>
                                  {event.assetLabel} · {event.contactName} · {event.planningLabel}
                                </span>
                              ))
                            )}

                            {events.length > 4 && (
                              <small>+ {events.length - 4} autre{events.length - 4 > 1 ? "s" : ""}</small>
                            )}
                          </div>
                        ) : (
                          <span />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Disponibilités</p>
            <h3>{visibleAssets.length} actif{visibleAssets.length > 1 ? "s" : ""}</h3>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Actif</th>
                <th>Catégorie</th>
                <th>Lieu</th>
                <th>Statut période</th>
                <th>Prochaines locations</th>
              </tr>
            </thead>

            <tbody>
              {visibleAssets.map((asset) => {
                const bookings = getBookingsForAsset(asset);
                const options = getOptionsForAsset(asset);

                return (
                  <tr key={`${asset.type}-${asset.id}`}>
                    <td>
                      <strong>{asset.label}</strong>
                      <small>
                        {bookings.length} confirmée{bookings.length > 1 ? "s" : ""} · {options.length} option{options.length > 1 ? "s" : ""}
                      </small>
                    </td>
                    <td>{asset.category}</td>
                    <td>{asset.location}</td>
                    <td>
                      <Badge>{getAvailabilityLabel(asset)}</Badge>
                    </td>
                    <td>
                      {bookings.length === 0 ? (
                        <span className="muted-line">Aucune location confirmée</span>
                      ) : (
                        bookings.slice(0, 3).map((booking) => (
                          <span className="muted-line" key={booking.id}>
                            {formatDateFR(booking.startDate)} → {formatDateFR(booking.endDate)} · {booking.contactName}
                          </span>
                        ))
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Options / demandes en cours</p>
            <h3>{pendingBookings.length} demande{pendingBookings.length > 1 ? "s" : ""}</h3>
          </div>
        </div>

        <div className="list-stack">
          {pendingBookings.length === 0 ? (
            <p className="muted-line">Aucune option en cours. Ajoutez un lead avec dates, actif lié et statut Contacté / Devis / Négociation pour le voir ici.</p>
          ) : (
            pendingBookings.map((booking) => (
              <article className="mini-row" key={booking.id}>
                <div>
                  <strong>{booking.assetLabel}</strong>
                  <span>{booking.contactName} · {formatDateFR(booking.startDate)} → {formatDateFR(booking.endDate)}</span>
                  <span>{booking.assetCategory} · {currency.format(booking.value)}</span>
                  {booking.nextAction && <span>{booking.nextAction}</span>}
                </div>
                <Badge>{booking.status}</Badge>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Locations confirmées</p>
            <h3>{confirmedBookings.length} réservation{confirmedBookings.length > 1 ? "s" : ""}</h3>
          </div>
        </div>

        <div className="list-stack">
          {confirmedBookings.length === 0 ? (
            <p className="muted-line">Aucune location confirmée pour le moment. Quand un lead est gagné avec dates et actif lié, il apparaîtra ici.</p>
          ) : (
            confirmedBookings.map((booking) => (
              <article className="mini-row" key={booking.id}>
                <div>
                  <strong>{booking.assetLabel}</strong>
                  <span>{booking.contactName} · {formatDateFR(booking.startDate)} → {formatDateFR(booking.endDate)}</span>
                  <span>{booking.assetCategory} · {currency.format(booking.value)}</span>
                </div>
                <Badge>Confirmé</Badge>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}


type FollowUpRecommendation = {
  id: string;
  title: string;
  detail: string;
  priority: "Haute" | "Moyenne";
  leadId?: string;
};

function getQuoteAgeDays(createdAt: string) {
  if (!createdAt) return 0;

  const createdDate = new Date(createdAt);

  if (Number.isNaN(createdDate.getTime())) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  createdDate.setHours(0, 0, 0, 0);

  return Math.max(0, Math.floor((today.getTime() - createdDate.getTime()) / 86400000));
}

function FollowUpsPanel({
  leads,
  tasks,
  quotes,
  onCreateTask
}: {
  leads: Lead[];
  tasks: Task[];
  quotes: QuoteRequest[];
  onCreateTask: (recommendation: FollowUpRecommendation) => void;
}) {
  const recommendations = useMemo<FollowUpRecommendation[]>(() => {
    const items: FollowUpRecommendation[] = [];

    const openTaskLeadIds = new Set(
      tasks
        .filter((task) => task.status !== "Terminé" && task.linkedTo)
        .map((task) => task.linkedTo)
    );

    leads.forEach((lead) => {
      if (lead.status === "Gagné" || lead.status === "Perdu") return;

      const hasOpenTask = openTaskLeadIds.has(lead.id);
      const dueStatus = getDueStatus(lead.dueDate);

      if (!hasOpenTask && (dueStatus === "overdue" || dueStatus === "today")) {
        items.push({
          id: `lead-due-${lead.id}`,
          title: `Relancer ${lead.contactName}`,
          detail: `${lead.category} · ${lead.status} · ${getDueLabel(lead.dueDate)}`,
          priority: dueStatus === "overdue" ? "Haute" : "Moyenne",
          leadId: lead.id
        });
      }

      if (!hasOpenTask && !lead.nextAction?.trim()) {
        items.push({
          id: `lead-action-${lead.id}`,
          title: `Définir la prochaine action pour ${lead.contactName}`,
          detail: `${lead.category} · ${lead.status} · aucune prochaine action renseignée`,
          priority: "Moyenne",
          leadId: lead.id
        });
      }
    });

    quotes.forEach((quote) => {
      const status = getQuoteStatus(quote.status);
      const ageDays = getQuoteAgeDays(quote.createdAt);

      if (status === "Sent" && ageDays >= 2) {
        items.push({
          id: `quote-sent-${quote.id}`,
          title: `Relancer le devis de ${quote.clientName}`,
          detail: `${quote.title || "Devis"} · envoyé depuis ${ageDays} jour${ageDays > 1 ? "s" : ""}`,
          priority: "Haute"
        });
      }

      if (status === "Accepted") {
        items.push({
          id: `quote-accepted-${quote.id}`,
          title: `Organiser la suite pour ${quote.clientName}`,
          detail: `${quote.title || "Devis accepté"} · préparer confirmation, paiement et logistique`,
          priority: "Haute"
        });
      }
    });

    return items.slice(0, 8);
  }, [leads, tasks, quotes]);

  return (
    <section className="card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Relances recommandées</p>
          <h3>{recommendations.length} action{recommendations.length > 1 ? "s" : ""} à traiter</h3>
        </div>
      </div>

      <div className="list-stack">
        {recommendations.length === 0 ? (
          <p className="muted-line">Aucune relance urgente pour le moment. Les leads en retard, sans action ou les devis à suivre apparaîtront ici.</p>
        ) : (
          recommendations.map((recommendation) => (
            <article className="mini-row" key={recommendation.id}>
              <div>
                <strong>{recommendation.title}</strong>
                <span>{recommendation.detail}</span>
              </div>

              <div className="quote-actions">
                <Badge>{recommendation.priority}</Badge>

                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => onCreateTask(recommendation)}
                >
                  Créer tâche
                </button>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function Dashboard({
  stats,
  data,
  onLeadStatusChange,
  onTaskStatusChange,
  onStartMessage,
  onStartContactLead,
  onStartInventory,
  onShowLeads,
  onCloudBackup
}: {
  stats: { pipeline: number; won: number; openTasks: number; availableProperties: number };
  data: CRMData;
  onLeadStatusChange: (id: string, status: LeadStatus) => void;
  onTaskStatusChange: (id: string, status: TaskStatus) => void;
  onStartMessage: () => void;
  onStartContactLead: () => void;
  onStartInventory: () => void;
  onShowLeads: () => void;
  onCloudBackup: () => void;
}) {
  const nextTasks = [...data.tasks].filter((task) => task.status !== "Terminé").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const hotLeads = [...data.leads].filter((lead) => lead.status !== "Perdu").sort((a, b) => b.value - a.value).slice(0, 4);

  return (
    <div className="stack">
      <section
        className="card"
        style={{
          padding: 24,
          border: "1px solid rgba(160, 120, 70, 0.28)",
          background: "rgba(247, 241, 231, 0.9)"
        }}
      >
        <p className="eyebrow">Démarrer ici</p>
        <div
          style={{
            margin: "8px 0 10px",
            color: "#071f27",
            fontSize: 26,
            fontWeight: 600,
            lineHeight: 1.2,
            letterSpacing: "0.01em"
          }}
        >
          Que voulez-vous faire maintenant ?
        </div>
        <p className="muted-line">
          Créez rapidement les données, suivez les demandes et sauvegardez le CRM après chaque lot d’ajouts.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 18 }}>
          <button className="primary-button" type="button" onClick={onStartMessage}>
            Créer depuis un message client
          </button>

          <button className="secondary-button" type="button" onClick={onStartContactLead}>
            Ajouter contact / lead
          </button>

          <button className="secondary-button" type="button" onClick={onStartInventory}>
            Ajouter bien / voiture / bateau
          </button>

          <button className="secondary-button" type="button" onClick={onShowLeads}>
            Voir les leads
          </button>

          <button className="secondary-button" type="button" onClick={onCloudBackup}>
            Sauvegarde cloud
          </button>
        </div>

        <p className="muted-line" style={{ marginTop: 16 }}>
          Conseil : après 5 à 10 ajouts, utilisez Backup fichier puis Sauvegarde cloud.
        </p>
      </section>

      <div className="stats-grid">
        <StatCard label="Pipeline actif" value={currency.format(stats.pipeline)} caption="Valeur des opportunités non perdues" />
        <StatCard label="CA gagné" value={currency.format(stats.won)} caption="Leads marqués comme gagnés" />
        <StatCard label="Tâches ouvertes" value={String(stats.openTasks)} caption="Actions commerciales à traiter" />
        <StatCard label="Biens disponibles" value={String(stats.availableProperties)} caption="Inventaire prêt à proposer" />
      </div>

      <div className="two-columns">
        <section className="card">
          <div className="section-heading">
            <div>

      <p className="eyebrow">Priorité</p>
              <h3>Leads chauds</h3>
            </div>
          </div>
          <div className="list-stack">
            {hotLeads.map((lead) => (
              <article className="mini-row" key={lead.id}>
                <div>
                  <strong>{lead.category}</strong>
                  <span>{lead.contactName} · {currency.format(lead.value)}</span>
                </div>
                <select value={lead.status} onChange={(event) => onLeadStatusChange(lead.id, event.target.value as LeadStatus)}>
                  {leadStatuses.map((status) => <option key={status}>{status}</option>)}
                </select>
              </article>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">À faire</p>
              <h3>Prochaines actions</h3>
            </div>
          </div>
          <div className="list-stack">
            {nextTasks.map((task) => (
              <article className="mini-row" key={task.id}>
                <div>
                  <strong>{task.title}</strong>
                  <span>{task.dueDate || "Sans date"} · {task.linkedTo}</span>
                </div>
                <select value={task.status} onChange={(event) => onTaskStatusChange(task.id, event.target.value as TaskStatus)}>
                  {taskStatuses.map((status) => <option key={status}>{status}</option>)}
                </select>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <article className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{caption}</p>
    </article>
  );
}

function ContactsView({
  contacts,
  leads,
  tasks,
  onAdd,
  onUpdate,
  onDelete,
  onCreateLead,
  onCreateTask
}: {
  contacts: Contact[];
  leads: Lead[];
  tasks: Task[];
  onAdd: (event: React.FormEvent<HTMLFormElement>) => void;
  onUpdate: (contact: Contact) => void;
  onDelete: (id: string) => void;
  onCreateLead: (contactName: string) => void;
  onCreateTask: (contactName: string) => void;
}) {
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  function getContactLeads(contact: Contact) {
    return leads.filter((lead) => lead.contactName === contact.name);
  }

  function getContactTasks(contact: Contact) {
    const contactLeads = getContactLeads(contact);
    const leadIds = new Set(contactLeads.map((lead) => lead.id));

    return tasks.filter((task) => leadIds.has(task.linkedTo));
  }

  function getPropertyLeads(property: Property) {
    return leads.filter((lead) => lead.assetType === "Property" && lead.assetId === property.id);
  }

  function getVehicleLeads(vehicle: Vehicle) {
    return leads.filter((lead) => lead.assetType === "Vehicle" && lead.assetId === vehicle.id);
  }

  function getBoatLeads(boat: Boat) {
    return leads.filter((lead) => lead.assetType === "Boat" && lead.assetId === boat.id);
  }

  function submitEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingContact) return;

    const form = new FormData(event.currentTarget);

    const updatedContact: Contact = {
      ...editingContact,
      name: String(form.get("name") ?? "").trim(),
      kind: String(form.get("kind") ?? "Client") as Contact["kind"],
      email: String(form.get("email") ?? "").trim(),
      phone: String(form.get("phone") ?? "").trim(),
      city: String(form.get("city") ?? "").trim(),
      postalAddress: String(form.get("postalAddress") ?? "").trim(),
      budget: safeNumber(form.get("budget")),
      source: String(form.get("source") ?? "").trim(),
      notes: String(form.get("notes") ?? "").trim(),
      clientLevel: String(form.get("clientLevel") ?? getContactClientLevel(editingContact)) as NonNullable<Contact["clientLevel"]>,
      preferredLanguage: String(form.get("preferredLanguage") ?? getContactPreferredLanguage(editingContact)) as NonNullable<Contact["preferredLanguage"]>,
      relationshipStatus: String(form.get("relationshipStatus") ?? getContactRelationshipStatus(editingContact)) as NonNullable<Contact["relationshipStatus"]>,
      preferences: String(form.get("preferences") ?? "").trim(),
      importantNotes: String(form.get("importantNotes") ?? "").trim()
    };

    if (!updatedContact.name) return;

    onUpdate(updatedContact);
    setEditingContact(null);
    setSelectedContact(updatedContact);
  }

  function openEdit(contact: Contact) {
    setEditingContact(contact);

    setTimeout(() => {
      document.getElementById("contact-edit-panel")?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }, 50);
  }

  return (
    <div className="two-columns wide-left">
      <section className="card">
        <p className="eyebrow">Base client</p>
        <h3>{contacts.length} contacts</h3>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nom</th>
                <th>Type</th>
                <th>Ville / adresse</th>
                <th>Budget</th>
                <th>Contact</th>
              </tr>
            </thead>

            <tbody>
              {contacts.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">
                      <h3>Aucun contact pour le moment</h3>
                      <p>Commencez par “Ajouter contact / lead” ou “Créer depuis un message client”.</p>
                    </div>
                  </td>
                </tr>
              )}

              {contacts.map((contact) => (
                <tr key={contact.id}>
                  <td>
                    <strong>{contact.name}</strong>
                    <small>{contact.source || "Source non renseignée"}</small>
                    <small>{getContactClientLevel(contact)} · {getContactPreferredLanguage(contact)} · {getContactRelationshipStatus(contact)}</small>
                    <small>
                      {getContactLeads(contact).length} lead{getContactLeads(contact).length > 1 ? "s" : ""} · {getContactTasks(contact).length} tâche{getContactTasks(contact).length > 1 ? "s" : ""}
                    </small>

                    <div className="contact-row-actions">
                      <button
                        className="contact-detail-button"
                        type="button"
                        onClick={() => {
                          setSelectedContact(contact);
                          setTimeout(() => {
                            document.getElementById("contact-detail-panel")?.scrollIntoView({
                              behavior: "smooth",
                              block: "center"
                            });
                          }, 50);
                        }}
                      >
                        Détails
                      </button>

                      <button
                        className="contact-detail-button"
                        type="button"
                        onClick={() => onCreateTask(contact.name)}
                      >
                        Tâche
                      </button>

                      <button
                        className="contact-detail-button"
                        type="button"
                        onClick={() => onCreateLead(contact.name)}
                      >
                        Lead
                      </button>

                      <button
                        className="contact-edit-button"
                        type="button"
                        onClick={() => openEdit(contact)}
                      >
                        Modifier
                      </button>

                      <button
                        className="contact-delete-button"
                        type="button"
                        onClick={() => {
                          const confirmed = window.confirm(
                            `Confirmer la suppression de "${contact.name}" ?\n\nCette action supprimera le contact de la base client.`
                          );

                          if (confirmed) {
                            onDelete(contact.id);
                          }
                        }}
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>

                  <td>
                    <Badge>{contact.kind}</Badge>
                  </td>

                  <td>
                    <span className="muted-line">{contact.city || "—"}</span>
                    <span className="muted-line">{contact.postalAddress || "Adresse non renseignée"}</span>
                  </td>

                  <td>{contact.budget ? currency.format(contact.budget) : "—"}</td>

                  <td>
                    <span className="muted-line">{contact.email || "—"}</span>
                    <span className="muted-line">{contact.phone || "—"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card form-card">
        <p className="eyebrow">Nouveau</p>
        <h3>Ajouter un contact</h3>

        <form className="form-grid" onSubmit={onAdd}>
          <label>Nom<input name="name" placeholder="Nom complet" /></label>

          <label>Type
            <select name="kind">
              <option>Client</option>
              <option>Propriétaire</option>
              <option>Partenaire</option>
            </select>
          </label>

          <label>Niveau client
            <select name="clientLevel" defaultValue="Standard">
              {contactLevels.map((level) => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </label>

          <label>Langue préférée
            <select name="preferredLanguage" defaultValue="Français">
              {contactLanguages.map((language) => (
                <option key={language} value={language}>{language}</option>
              ))}
            </select>
          </label>

          <label>Relation
            <select name="relationshipStatus" defaultValue="Prospect">
              {contactRelationshipStatuses.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </label>

          <label>Email<input name="email" type="email" placeholder="email@example.com" /></label>
          <label>Téléphone<input name="phone" placeholder="+33..." /></label>
          <label>Ville<input name="city" placeholder="Cannes" /></label>
          <label>Adresse postale<input name="postalAddress" placeholder="12 Boulevard de la Croisette, 06400 Cannes" /></label>
          <label>Budget<input name="budget" type="number" min="0" placeholder="2500000" /></label>
          <label>Source<input name="source" placeholder="Site web, recommandation..." /></label>

          <label className="full">Préférences
            <textarea name="preferences" placeholder="Villa, bateau, voiture, chauffeur, chef privé, sécurité..." />
          </label>

          <label className="full">Notes importantes
            <textarea name="importantNotes" placeholder="Informations à voir immédiatement avant de contacter ce client." />
          </label>

          <label className="full">Notes
            <textarea name="notes" placeholder="Besoins, contexte, prochaines infos à retenir" />
          </label>

          <button className="primary-button" type="submit">Ajouter</button>
        </form>
      </section>

      {selectedContact && (
        <div className="confirm-backdrop">
          <div id="contact-detail-panel" className="confirm-dialog contact-detail-dialog" role="dialog" aria-modal="true">
            <p className="eyebrow">Fiche client</p>
            <h3>{selectedContact.name}</h3>

            <div className="contact-detail-grid">
              <div>
                <span>Type</span>
                <strong>{selectedContact.kind}</strong>
              </div>

              <div>
                <span>Budget</span>
                <strong>{selectedContact.budget ? currency.format(selectedContact.budget) : "Non renseigné"}</strong>
              </div>

              <div>
                <span>Niveau client</span>
                <strong>{getContactClientLevel(selectedContact)}</strong>
              </div>

              <div>
                <span>Langue préférée</span>
                <strong>{getContactPreferredLanguage(selectedContact)}</strong>
              </div>

              <div>
                <span>Relation</span>
                <strong>{getContactRelationshipStatus(selectedContact)}</strong>
              </div>

              <div>
                <span>Email</span>
                <strong>{selectedContact.email || "Non renseigné"}</strong>
              </div>

              <div>
                <span>Téléphone</span>
                <strong>{selectedContact.phone || "Non renseigné"}</strong>
              </div>

              <div>
                <span>Ville</span>
                <strong>{selectedContact.city || "Non renseignée"}</strong>
              </div>

              <div>
                <span>Source</span>
                <strong>{selectedContact.source || "Non renseignée"}</strong>
              </div>

              <div className="full">
                <span>Adresse postale</span>
                <strong>{selectedContact.postalAddress || "Non renseignée"}</strong>
              </div>

              <div className="full">
                <span>Préférences</span>
                <p>{selectedContact.preferences || "Aucune préférence renseignée."}</p>
              </div>

              <div className="full">
                <span>Notes importantes</span>
                <p>{selectedContact.importantNotes || "Aucune note importante."}</p>
              </div>

              <div className="full">
                <span>Notes client</span>
                <p>{selectedContact.notes || "Aucune note pour ce contact."}</p>
              </div>
            </div>

            <div className="contact-related-section">
              <p className="eyebrow">Synthèse commerciale</p>

              <div className="list-stack">
                <article className="mini-row">
                  <div>
                    <strong>Pipeline actif</strong>
                    <span>
                      {getContactLeads(selectedContact).filter((lead) => lead.status !== "Gagné" && lead.status !== "Perdu").length} lead{getContactLeads(selectedContact).filter((lead) => lead.status !== "Gagné" && lead.status !== "Perdu").length > 1 ? "s" : ""} ouvert{getContactLeads(selectedContact).filter((lead) => lead.status !== "Gagné" && lead.status !== "Perdu").length > 1 ? "s" : ""}
                    </span>
                  </div>
                  <strong>
                    {currency.format(
                      getContactLeads(selectedContact)
                        .filter((lead) => lead.status !== "Gagné" && lead.status !== "Perdu")
                        .reduce((sum, lead) => sum + lead.value, 0)
                    )}
                  </strong>
                </article>

                <article className="mini-row">
                  <div>
                    <strong>Gagné</strong>
                    <span>Valeur déjà gagnée avec ce contact</span>
                  </div>
                  <strong>
                    {currency.format(
                      getContactLeads(selectedContact)
                        .filter((lead) => lead.status === "Gagné")
                        .reduce((sum, lead) => sum + lead.value, 0)
                    )}
                  </strong>
                </article>

                <article className="mini-row">
                  <div>
                    <strong>Tâches ouvertes</strong>
                    <span>Actions restantes liées à ce contact</span>
                  </div>
                  <Badge>
                    {getContactTasks(selectedContact).filter((task) => task.status !== "Terminé").length}
                  </Badge>
                </article>
              </div>
            </div>

            <div className="contact-related-section">
              <p className="eyebrow">Leads liés</p>

              <div className="list-stack">
                {getContactLeads(selectedContact).length === 0 && (
                  <p className="muted-line">Aucun lead lié à ce contact.</p>
                )}

                {getContactLeads(selectedContact).map((lead) => (
                  <article className="mini-row" key={lead.id}>
                    <div>
                      <strong>{lead.category} • {lead.status}</strong>
                      <span>{lead.nextAction || "Aucune prochaine action"}</span>
                    </div>
                    <Badge>{lead.priority}</Badge>
                  </article>
                ))}
              </div>
            </div>

            <div className="contact-related-section">
              <p className="eyebrow">Tâches liées</p>

              <div className="list-stack">
                {getContactTasks(selectedContact).length === 0 && (
                  <p className="muted-line">Aucune tâche liée aux leads de ce contact.</p>
                )}

                {getContactTasks(selectedContact).map((task) => (
                  <article className="mini-row" key={task.id}>
                    <div>
                      <strong>{task.title}</strong>
                      <span>{task.owner || "Responsable non renseigné"} · {task.dueDate || "Sans échéance"}</span>
                    </div>
                    <Badge>{task.status}</Badge>
                  </article>
                ))}
              </div>
            </div>

            <div className="confirm-actions">
              <button className="ghost-button" type="button" onClick={() => setSelectedContact(null)}>
                Fermer
              </button>

              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  const contactName = selectedContact.name;
                  setSelectedContact(null);
                  onCreateLead(contactName);
                }}
              >
                Créer un lead
              </button>

              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  const contactName = selectedContact.name;
                  setSelectedContact(null);
                  onCreateTask(contactName);
                }}
              >
                Créer une tâche
              </button>

              <button
                className="primary-button"
                type="button"
                onClick={() => openEdit(selectedContact)}
              >
                Modifier
              </button>
            </div>
          </div>
        </div>
      )}

      {editingContact && (
        <div className="confirm-backdrop">
          <div id="contact-edit-panel" className="confirm-dialog edit-dialog" role="dialog" aria-modal="true">
            <p className="eyebrow">Modification</p>
            <h3>Modifier le contact</h3>

            <form className="form-grid" onSubmit={submitEdit}>
              <label>Nom<input name="name" defaultValue={editingContact.name} /></label>

              <label>Type
                <select name="kind" defaultValue={editingContact.kind}>
                  <option>Client</option>
                  <option>Propriétaire</option>
                  <option>Partenaire</option>
                </select>
              </label>

              <label>Niveau client
                <select name="clientLevel" defaultValue={getContactClientLevel(editingContact)}>
                  {contactLevels.map((level) => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </label>

              <label>Langue préférée
                <select name="preferredLanguage" defaultValue={getContactPreferredLanguage(editingContact)}>
                  {contactLanguages.map((language) => (
                    <option key={language} value={language}>{language}</option>
                  ))}
                </select>
              </label>

              <label>Relation
                <select name="relationshipStatus" defaultValue={getContactRelationshipStatus(editingContact)}>
                  {contactRelationshipStatuses.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>

              <label>Email<input name="email" type="email" defaultValue={editingContact.email} /></label>
              <label>Téléphone<input name="phone" defaultValue={editingContact.phone} /></label>
              <label>Ville<input name="city" defaultValue={editingContact.city} /></label>
              <label>Adresse postale<input name="postalAddress" defaultValue={editingContact.postalAddress} /></label>
              <label>Budget<input name="budget" type="number" min="0" defaultValue={editingContact.budget || ""} /></label>
              <label>Source<input name="source" defaultValue={editingContact.source} /></label>

              <label className="full">Préférences
                <textarea name="preferences" defaultValue={editingContact.preferences ?? ""} />
              </label>

              <label className="full">Notes importantes
                <textarea name="importantNotes" defaultValue={editingContact.importantNotes ?? ""} />
              </label>

              <label className="full">Notes
                <textarea name="notes" defaultValue={editingContact.notes} />
              </label>

              <div className="confirm-actions full">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => setEditingContact(null)}
                >
                  Annuler
                </button>

                <button className="primary-button" type="submit">
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


function LeadsView({
  leads,
  contacts,
  tasks,
  properties,
  vehicles,
  boats,
  preselectedContactName,
  onAdd,
  onUpdate,
  onStatusChange,
  onDelete,
  onCreateQuote,
  onCreateTask
}: {
  leads: Lead[];
  contacts: Contact[];
  tasks: Task[];
  properties: Property[];
  vehicles: Vehicle[];
  boats: Boat[];
  preselectedContactName?: string;
  onAdd: (event: React.FormEvent<HTMLFormElement>) => void;
  onUpdate: (lead: Lead) => void;
  onStatusChange: (id: string, status: LeadStatus) => void;
  onDelete: (id: string) => void;
  onCreateQuote: (lead: Lead) => void;
  onCreateTask: (lead: Lead) => void;
}) {
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [leadCategoryFilter, setLeadCategoryFilter] = useState<"Toutes" | Lead["category"]>("Toutes");
  const [leadStatusFilter, setLeadStatusFilter] = useState<"Tous" | LeadStatus>("Tous");
  const [leadPriorityFilter, setLeadPriorityFilter] = useState<"Toutes" | Lead["priority"]>("Toutes");
  const [leadDueFilter, setLeadDueFilter] = useState<"Tous" | "En retard" | "Aujourd'hui" | "À venir" | "Sans échéance">("Tous");
  const [leadActionFilter, setLeadActionFilter] = useState<"Tous" | "Sans prochaine action">("Tous");

  const assetOptions = [
    ...properties.map((property) => ({
      id: property.id,
      type: "Property" as const,
      label: `Villa / Bien • ${getPropertyDisplayName(property)}`
    })),
    ...vehicles.map((vehicle) => ({
      id: vehicle.id,
      type: "Vehicle" as const,
      label: `Voiture • ${vehicle.name}`
    })),
    ...boats.map((boat) => ({
      id: boat.id,
      type: "Boat" as const,
      label: `Bateau • ${boat.name}`
    }))
  ];

  function getLeadAssetLabel(lead: Lead) {
    if (!lead.assetType || !lead.assetId) return "";

    return assetOptions.find((asset) => asset.type === lead.assetType && asset.id === lead.assetId)?.label ?? "";
  }

  function submitEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingLead) return;

    const form = new FormData(event.currentTarget);
    const assetSelection = parseAssetKey(form.get("assetKey"));

    const updatedLead: Lead = {
      ...editingLead,
      category: String(form.get("category") ?? "Villa") as Lead["category"],
      contactName: String(form.get("contactName") ?? "").trim(),
      assetType: assetSelection.assetType,
      assetId: assetSelection.assetId,
      status: String(form.get("status") ?? "Nouveau") as LeadStatus,
      value: safeNumber(form.get("value")),
      priority: String(form.get("priority") ?? "Moyenne") as Lead["priority"],
      dueDate: String(form.get("dueDate") ?? ""),
      rentalStartDate: String(form.get("rentalStartDate") ?? ""),
      rentalEndDate: String(form.get("rentalEndDate") ?? ""),
      nextAction: String(form.get("nextAction") ?? "").trim(),
      notes: String(form.get("notes") ?? "").trim()
    };

    if (!updatedLead.contactName) return;

    onUpdate(updatedLead);
    setEditingLead(null);
  }

  function getLeadTasks(lead: Lead) {
    return tasks.filter((task) => task.linkedTo === lead.id);
  }

  function openEdit(lead: Lead) {
    setEditingLead(lead);

    setTimeout(() => {
      document.getElementById("lead-edit-panel")?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }, 50);
  }


const visibleLeads = leads.filter((lead) => {
    const dueStatus = getDueStatus(lead.dueDate);

    const categoryMatches = leadCategoryFilter === "Toutes" || lead.category === leadCategoryFilter;
    const statusMatches = leadStatusFilter === "Tous" ? lead.status !== "Perdu" : lead.status === leadStatusFilter;
    const priorityMatches = leadPriorityFilter === "Toutes" || lead.priority === leadPriorityFilter;

    const dueMatches =
      leadDueFilter === "Tous" ||
      (leadDueFilter === "En retard" && dueStatus === "overdue") ||
      (leadDueFilter === "Aujourd'hui" && dueStatus === "today") ||
      (leadDueFilter === "À venir" && dueStatus === "future") ||
      (leadDueFilter === "Sans échéance" && dueStatus === "none");

    const actionMatches =
      leadActionFilter === "Tous" ||
      !lead.nextAction?.trim();

    return categoryMatches && statusMatches && priorityMatches && dueMatches && actionMatches;
  });

  const filtersAreActive =
    leadCategoryFilter !== "Toutes" ||
    leadStatusFilter !== "Tous" ||
    leadPriorityFilter !== "Toutes" ||
    leadDueFilter !== "Tous" ||
    leadActionFilter !== "Tous";

  const [collapsedLeadStatuses, setCollapsedLeadStatuses] = useState<Partial<Record<LeadStatus, boolean>>>({});

  function toggleLeadColumn(status: LeadStatus) {
    setCollapsedLeadStatuses((current) => ({
      ...current,
      [status]: !current[status]
    }));
  }

  return (
    <div className="stack">
      <section id="lead-create-form" className="card form-card horizontal-form">
        <div>
          <p className="eyebrow">Nouveau</p>
          <h3>Ajouter un lead</h3>
        </div>

        <form className="lead-smart-form" onSubmit={onAdd}>
          <fieldset className="lead-form-block">
            <legend>1 · Client & demande</legend>

            <label>Catégorie
              <select name="category" defaultValue="Villa">
                <option value="Villa">Villa</option>
                <option value="Voiture">Voiture</option>
                <option value="Bateau">Bateau</option>
                <option value="Conciergerie">Conciergerie</option>
              </select>
            </label>

            <label>Contact
              <select name="contactName" required defaultValue={preselectedContactName || ""}>
                <option value="">Sélectionner un contact</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.name}>
                    {contact.name}
                  </option>
                ))}
              </select>
            </label>

            <label>Actif proposé
              <select name="assetKey" defaultValue="">
                <option value="">Aucun actif lié</option>
                {assetOptions.map((asset) => (
                  <option key={`${asset.type}:${asset.id}`} value={`${asset.type}:${asset.id}`}>
                    {asset.label}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>

          <fieldset className="lead-form-block">
            <legend>2 · Planning & budget</legend>

            <label>Début réservation
              <input name="rentalStartDate" type="date" />
            </label>

            <label>Fin réservation
              <input name="rentalEndDate" type="date" />
            </label>

            <label>Valeur
              <input name="value" type="number" min="0" placeholder="2500" />
            </label>
          </fieldset>

          <fieldset className="lead-form-block">
            <legend>3 · Suivi commercial</legend>

            <label>Statut
              <select name="status" defaultValue="Nouveau">
                
        {visibleLeads.length === 0 && (
          <div className="empty-state">
            <h3>Aucun lead affiché</h3>
            <p>
              Ajoutez un lead avec “Ajouter contact / lead” ou modifiez les filtres si vous cherchez une demande existante.
            </p>
          </div>
        )}

{leadStatuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>

            <label>Priorité
              <select name="priority" defaultValue="Moyenne">
                <option>Basse</option>
                <option>Moyenne</option>
                <option>Haute</option>
              </select>
            </label>

            <label>Échéance réponse
              <input name="dueDate" type="date" />
            </label>

            <label className="full">Prochaine action
              <input name="nextAction" placeholder="Appeler, envoyer proposition, relancer..." />
            </label>

            <label className="full">Notes internes
              <textarea name="notes" placeholder="Préférences client, contraintes, détails importants..." />
            </label>
          </fieldset>

          <div className="lead-form-actions">
            <button className="primary-button" type="submit">Ajouter le lead</button>
          </div>
        </form>
      </section>

      <section className="card lead-filter-card">
        <div>
          <p className="eyebrow">Filtres rapides</p>
          <h3>{visibleLeads.length} leads affichés</h3>
        </div>

        <div className="lead-filter-grid">
          <label>Catégorie
            <select
              value={leadCategoryFilter}
              onChange={(event) => setLeadCategoryFilter(event.target.value as "Toutes" | Lead["category"])}
            >
              <option value="Toutes">Toutes</option>
              <option value="Villa">Villa</option>
              <option value="Voiture">Voiture</option>
              <option value="Bateau">Bateau</option>
              <option value="Conciergerie">Conciergerie</option>
            </select>
          </label>

          <label>Statut
            <select
              value={leadStatusFilter}
              onChange={(event) => setLeadStatusFilter(event.target.value as "Tous" | LeadStatus)}
            >
              <option value="Tous">Tous</option>
              {leadStatuses.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </label>

          <label>Priorité
            <select
              value={leadPriorityFilter}
              onChange={(event) => setLeadPriorityFilter(event.target.value as "Toutes" | Lead["priority"])}
            >
              <option value="Toutes">Toutes</option>
              <option value="Basse">Basse</option>
              <option value="Moyenne">Moyenne</option>
              <option value="Haute">Haute</option>
            </select>
          </label>
        </div>
      </section>

      <section className="pipeline-grid compact-pipeline" aria-label="Pipeline leads">
        {leadStatuses.map((status) => {
          const columnLeads = sortByUrgency(visibleLeads.filter((lead) => lead.status === status));
          const isCollapsed = Boolean(collapsedLeadStatuses[status]);

          return (
            <div className={`pipeline-column ${isCollapsed ? "is-collapsed" : ""}`} key={status}>
              <button
                className="asset-reset-button pipeline-title pipeline-toggle"
                type="button"
                onClick={() => toggleLeadColumn(status)}
                aria-expanded={!isCollapsed}
              >
                <strong>{status}</strong>
                <span>{columnLeads.length}</span>
                <em>{isCollapsed ? "▾" : "▴"}</em>
              </button>

              {!isCollapsed && (
                <div className="list-stack">
                  {columnLeads.map((lead) => (
                    <article className={`lead-card ${getDueStatus(lead.dueDate)}`} key={lead.id}>
                      <div className="lead-topline">
                        <Badge>{lead.priority}</Badge>

                        <button
                          className="icon-button"
                          type="button"
                          onClick={() => {
                            const confirmed = window.confirm(
                              `Supprimer ce lead pour "${lead.contactName}" ?`
                            );

                            if (confirmed) {
                              onDelete(lead.id);
                            }
                          }}
                          aria-label="Supprimer"
                        >
                          ×
                        </button>
                      </div>

                      <strong>{lead.category}</strong>
                      <span>{lead.contactName}</span>
                      <small>{formatReservationPeriod(lead.rentalStartDate, lead.rentalEndDate)}</small>

                      {getLeadAssetLabel(lead) && (
                        <small className="asset-linked-line">{getLeadAssetLabel(lead)}</small>
                      )}

                      <p>{lead.nextAction || "Aucune prochaine action"}</p>

                      {lead.notes && (
                        <p className="lead-note-preview">{lead.notes}</p>
                      )}

                      <div className="lead-footer">
                        <b>{currency.format(lead.value)}</b>
                        <small className={`due-label ${getDueStatus(lead.dueDate)}`}>
                          {getDueLabel(lead.dueDate)}
                        </small>
                      </div>

                      <select value={lead.status} onChange={(event) => onStatusChange(lead.id, event.target.value as LeadStatus)}>
                        {leadStatuses.map((option) => <option key={option}>{option}</option>)}
                      </select>

                      <div className="lead-card-actions">
                        <button className="lead-detail-button" type="button" onClick={() => setSelectedLead(lead)}>
                          Détails
                        </button>

                        <button className="lead-detail-button" type="button" onClick={() => onCreateTask(lead)}>
                          Tâche
                        </button>

                        <button className="lead-detail-button" type="button" onClick={() => onCreateQuote(lead)}>
                          Devis
                        </button>

                        <button className="lead-edit-button" type="button" onClick={() => openEdit(lead)}>
                          Modifier
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>

      {selectedLead && (
        <div className="confirm-backdrop">
          <div className="confirm-dialog lead-detail-dialog" role="dialog" aria-modal="true">
            <p className="eyebrow">Fiche lead</p>
            <h3>{selectedLead.category} • {selectedLead.contactName}</h3>

            <div className="lead-detail-grid">
              <div>
                <span>Statut</span>
                <strong>{selectedLead.status}</strong>
              </div>

              <div>
                <span>Priorité</span>
                <strong>{selectedLead.priority}</strong>
              </div>

              <div>
                <span>Valeur</span>
                <strong>{currency.format(selectedLead.value)}</strong>
              </div>

              <div>
                <span>Échéance réponse</span>
                <strong>{selectedLead.dueDate ? formatDateFR(selectedLead.dueDate) : "Non renseignée"}</strong>
              </div>

              <div className="full">
                <span>Date de réservation</span>
                <strong>{formatReservationPeriod(selectedLead.rentalStartDate, selectedLead.rentalEndDate)}</strong>
              </div>

              <div className="full">
                <span>Prochaine action</span>
                <strong>{selectedLead.nextAction || "Aucune prochaine action"}</strong>
              </div>

              <div className="full">
                <span>Notes internes</span>
                <p>{selectedLead.notes || "Aucune note interne pour le moment."}</p>
              </div>
            </div>

            <div className="lead-related-section">
              <p className="eyebrow">Tâches liées à ce lead</p>

              <div className="list-stack">
                {getLeadTasks(selectedLead).length === 0 && (
                  <p className="muted-line">Aucune tâche liée pour le moment.</p>
                )}

                {getLeadTasks(selectedLead).map((task) => (
                  <article className="mini-row" key={task.id}>
                    <div>
                      <strong>{task.title}</strong>
                      <span>
                        {task.owner || "Responsable non renseigné"}
                        {" · "}
                        {task.dueDate ? `Échéance ${formatDateFR(task.dueDate)}` : "Sans échéance"}
                      </span>
                    </div>
                    <Badge>{task.status}</Badge>
                  </article>
                ))}
              </div>
            </div>

            <div className="confirm-actions">
              <button className="ghost-button" type="button" onClick={() => setSelectedLead(null)}>
                Fermer
              </button>

                              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  const lead = selectedLead;
                  setSelectedLead(null);
                  onCreateTask(lead);
                }}
              >
                Créer une tâche
              </button>

              <button
                className="primary-button"
                type="button"
                onClick={() => {
                  const lead = selectedLead;
                  setSelectedLead(null);
                  openEdit(lead);
                }}
              >
                Modifier
              </button>
            </div>
          </div>
        </div>
      )}

      {editingLead && (
        <div className="confirm-backdrop">
          <div id="lead-edit-panel" className="confirm-dialog edit-dialog" role="dialog" aria-modal="true">
            <p className="eyebrow">Modification</p>
            <h3>Modifier le lead</h3>

            <form className="form-grid" onSubmit={submitEdit}>
              <label>Catégorie
                <select name="category" defaultValue={editingLead.category}>
                  <option value="Villa">Villa</option>
                  <option value="Voiture">Voiture</option>
                  <option value="Bateau">Bateau</option>
                  <option value="Conciergerie">Conciergerie</option>
                </select>
              </label>

              <label>Contact
                <select name="contactName" defaultValue={editingLead.contactName} required>
                  <option value="">Sélectionner un contact</option>
                  {contacts.map((contact) => (
                    <option key={contact.id} value={contact.name}>
                      {contact.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>Actif proposé
                <select
                  name="assetKey"
                  defaultValue={editingLead.assetType && editingLead.assetId ? `${editingLead.assetType}:${editingLead.assetId}` : ""}
                >
                  <option value="">Aucun actif lié</option>
                  {assetOptions.map((asset) => (
                    <option key={`${asset.type}:${asset.id}`} value={`${asset.type}:${asset.id}`}>
                      {asset.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>Statut
                <select name="status" defaultValue={editingLead.status}>
                  {leadStatuses.map((status) => <option key={status}>{status}</option>)}
                </select>
              </label>

              <label>Valeur<input name="value" type="number" min="0" defaultValue={editingLead.value || ""} /></label>

              <label>Priorité
                <select name="priority" defaultValue={editingLead.priority}>
                  <option>Basse</option>
                  <option>Moyenne</option>
                  <option>Haute</option>
                </select>
              </label>

              <label>Échéance<input name="dueDate" type="date" defaultValue={editingLead.dueDate} /></label>
              <label>Début réservation<input name="rentalStartDate" type="date" defaultValue={editingLead.rentalStartDate} /></label>
              <label>Fin réservation<input name="rentalEndDate" type="date" defaultValue={editingLead.rentalEndDate} /></label>

              <label className="full">Prochaine action
                <input name="nextAction" defaultValue={editingLead.nextAction} />
              </label>

              <label className="full">Notes internes
                <textarea name="notes" defaultValue={editingLead.notes ?? ""} />
              </label>

              <div className="confirm-actions full">
                <button className="ghost-button" type="button" onClick={() => setEditingLead(null)}>
                  Annuler
                </button>

                <button className="primary-button" type="submit">
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


function PropertiesView({
  properties,
  leads,
  onAdd,
  onUpdate,
  onDelete
}: {
  properties: Property[];
  leads: Lead[];
  onAdd: (event: React.FormEvent<HTMLFormElement>) => void;
  onUpdate: (property: Property) => void;
  onDelete: (id: string) => void;
}) {
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [propertyStatusFilter, setPropertyStatusFilter] = useState<"Tous" | PropertyStatus>("Tous");
  const [propertyCityFilter, setPropertyCityFilter] = useState("");

  const visibleProperties = properties.filter((property) => {
    const statusMatches = propertyStatusFilter === "Tous" || property.status === propertyStatusFilter;
    const cityMatches = property.city.toLowerCase().includes(propertyCityFilter.toLowerCase().trim());
    return statusMatches && cityMatches;
  });

  function getPropertyLeads(property: Property) {
    return leads.filter((lead) => lead.assetType === "Property" && lead.assetId === property.id);
  }

  function submitEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingProperty) return;

    const form = new FormData(event.currentTarget);

    const updatedProperty: Property = {
      ...editingProperty,
      name: String(form.get("name") ?? "").trim(),
      city: String(form.get("city") ?? "").trim(),
      price: safeNumber(form.get("price")),
      status: String(form.get("status") ?? "Disponible") as PropertyStatus,
      owner: String(form.get("owner") ?? "").trim(),
      bedrooms: safeNumber(form.get("bedrooms")),
      surface: safeNumber(form.get("surface")),
      notes: String(form.get("notes") ?? "").trim()
    };

    if (!updatedProperty.name) return;

    onUpdate(updatedProperty);
    setEditingProperty(null);
    setSelectedProperty(updatedProperty);
  }

  function openEdit(property: Property) {
    setEditingProperty(property);

    setTimeout(() => {
      document.getElementById("property-edit-panel")?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }, 50);
  }

  return (
    <div className="two-columns wide-left">
      <section className="property-grid">
        <div className="card asset-filter-card">
          <div>
            <p className="eyebrow">Filtres biens</p>
            <h3>{visibleProperties.length} biens affichés</h3>
          </div>

          <div className="asset-filter-grid">
            <label>Statut
              <select value={propertyStatusFilter} onChange={(event) => setPropertyStatusFilter(event.target.value as "Tous" | PropertyStatus)}>
                <option value="Tous">Tous</option>
                {propertyStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>

            <label>Ville
              <input value={propertyCityFilter} onChange={(event) => setPropertyCityFilter(event.target.value)} placeholder="Cannes, Nice..." />
            </label>
          </div>
        </div>

        {visibleProperties.length === 0 && (
          <div className="empty-state">
            <h3>Aucun bien trouvé</h3>
            <p>Ajoutez un bien avec “Ajouter bien / voiture / bateau” ou modifiez les filtres.</p>
          </div>
        )}

        {visibleProperties.map((property) => (
          <article className="property-card" key={property.id}>
            <div className="property-visual">
              <span>{property.city || "Bien"}</span>

              <button
                className="asset-reset-button icon-button light"
                onClick={() => {
                  const confirmed = window.confirm(`Supprimer "${property.name}" ?`);
                  if (confirmed) onDelete(property.id);
                }}
                aria-label="Supprimer"
              >
                ×
              </button>
            </div>

            <div className="property-body">
              <div className="section-heading compact-heading">
                <div>
                  <h3>{property.name}</h3>
                  <p>{property.city || "Ville non renseignée"}</p>
                </div>
                <Badge>{property.status}</Badge>
              </div>

              <dl className="property-meta">
                <div><dt>Prix</dt><dd>{currency.format(property.price)}</dd></div>
                <div><dt>Chambres</dt><dd>{property.bedrooms || "—"}</dd></div>
                <div><dt>Surface</dt><dd>{property.surface ? `${property.surface} m²` : "—"}</dd></div>
                <div><dt>Owner</dt><dd>{property.owner || "—"}</dd></div>
              </dl>

              <div className="asset-card-actions">
                <button className="asset-detail-button" type="button" onClick={() => setSelectedProperty(property)}>
                  Détails
                </button>

                <button className="asset-edit-button" type="button" onClick={() => openEdit(property)}>
                  Modifier
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="card form-card">
        <p className="eyebrow">Nouveau</p>
        <h3>Ajouter un bien</h3>

        <form className="form-grid" onSubmit={onAdd}>
          <label>Nom<input name="name" placeholder="Villa Belle Époque" /></label>
          <label>Ville<input name="city" placeholder="Cannes" /></label>
          <label>Prix<input name="price" type="number" min="0" placeholder="120000" /></label>

          <label>Statut
            <select name="status">
              {propertyStatuses.map((status) => <option key={status}>{status}</option>)}
            </select>
          </label>

          <label>Propriétaire<input name="owner" placeholder="Nom owner" /></label>
          <label>Chambres<input name="bedrooms" type="number" min="0" placeholder="6" /></label>
          <label>Surface m²<input name="surface" type="number" min="0" placeholder="420" /></label>

          <button className="primary-button" type="submit">Ajouter</button>
        </form>
      </section>

      {selectedProperty && (
        <div className="confirm-backdrop">
          <div className="confirm-dialog asset-detail-dialog" role="dialog" aria-modal="true">
            <p className="eyebrow">Fiche bien</p>
            <h3>{selectedProperty.name}</h3>

            <div className="asset-detail-grid">
              <div><span>Statut</span><strong>{selectedProperty.status}</strong></div>
              <div><span>Ville</span><strong>{selectedProperty.city || "Non renseignée"}</strong></div>
              <div><span>Prix</span><strong>{currency.format(selectedProperty.price)}</strong></div>
              <div><span>Owner</span><strong>{selectedProperty.owner || "Non renseigné"}</strong></div>
              <div><span>Chambres</span><strong>{selectedProperty.bedrooms || "—"}</strong></div>
              <div><span>Surface</span><strong>{selectedProperty.surface ? `${selectedProperty.surface} m²` : "—"}</strong></div>
              <div className="full"><span>Notes internes</span><p>{selectedProperty.notes || "Aucune note interne."}</p></div>
            </div>

            <div className="asset-related-section">
              <p className="eyebrow">Leads liés à ce bien</p>

              <div className="list-stack">
                {getPropertyLeads(selectedProperty).length === 0 && (
                  <p className="muted-line">Aucun lead lié à ce bien.</p>
                )}

                {getPropertyLeads(selectedProperty).map((lead) => (
                  <article className="mini-row" key={lead.id}>
                    <div>
                      <strong>{lead.contactName}</strong>
                      <span>{lead.status} · {currency.format(lead.value)}</span>
                    </div>
                    <Badge>{lead.priority}</Badge>
                  </article>
                ))}
              </div>
            </div>

            <div className="confirm-actions">
              <button className="ghost-button" type="button" onClick={() => setSelectedProperty(null)}>Fermer</button>
              <button className="primary-button" type="button" onClick={() => openEdit(selectedProperty)}>Modifier</button>
            </div>
          </div>
        </div>
      )}

      {editingProperty && (
        <div className="confirm-backdrop">
          <div id="property-edit-panel" className="confirm-dialog edit-dialog" role="dialog" aria-modal="true">
            <p className="eyebrow">Modification</p>
            <h3>Modifier le bien</h3>

            <form className="form-grid" onSubmit={submitEdit}>
              <label>Nom<input name="name" defaultValue={editingProperty.name} /></label>
              <label>Ville<input name="city" defaultValue={editingProperty.city} /></label>
              <label>Prix<input name="price" type="number" min="0" defaultValue={editingProperty.price || ""} /></label>

              <label>Statut
                <select name="status" defaultValue={editingProperty.status}>
                  {propertyStatuses.map((status) => <option key={status}>{status}</option>)}
                </select>
              </label>

              <label>Propriétaire<input name="owner" defaultValue={editingProperty.owner} /></label>
              <label>Chambres<input name="bedrooms" type="number" min="0" defaultValue={editingProperty.bedrooms || ""} /></label>
              <label>Surface m²<input name="surface" type="number" min="0" defaultValue={editingProperty.surface || ""} /></label>

              <label className="full">Notes internes
                <textarea name="notes" defaultValue={editingProperty.notes ?? ""} />
              </label>

              <div className="confirm-actions full">
                <button className="ghost-button" type="button" onClick={() => setEditingProperty(null)}>Annuler</button>
                <button className="primary-button" type="submit">Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function VehiclesView({
  vehicles,
  leads,
  onAdd,
  onUpdate,
  onDelete
}: {
  vehicles: Vehicle[];
  leads: Lead[];
  onAdd: (event: React.FormEvent<HTMLFormElement>) => void;
  onUpdate: (vehicle: Vehicle) => void;
  onDelete: (id: string) => void;
}) {
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [vehicleStatusFilter, setVehicleStatusFilter] = useState<"Tous" | VehicleStatus>("Tous");
  const [vehicleCityFilter, setVehicleCityFilter] = useState("");

  const visibleVehicles = vehicles.filter((vehicle) => {
    const statusMatches = vehicleStatusFilter === "Tous" || vehicle.status === vehicleStatusFilter;
    const cityMatches = vehicle.city.toLowerCase().includes(vehicleCityFilter.toLowerCase().trim());
    return statusMatches && cityMatches;
  });

  function getVehicleLeads(vehicle: Vehicle) {
    return leads.filter((lead) => lead.assetType === "Vehicle" && lead.assetId === vehicle.id);
  }

  function submitEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingVehicle) return;

    const form = new FormData(event.currentTarget);

    const updatedVehicle: Vehicle = {
      ...editingVehicle,
      name: String(form.get("name") ?? "").trim(),
      brand: String(form.get("brand") ?? "").trim(),
      model: String(form.get("model") ?? "").trim(),
      city: String(form.get("city") ?? "").trim(),
      price: safeNumber(form.get("price")),
      status: String(form.get("status") ?? "Disponible") as VehicleStatus,
      owner: String(form.get("owner") ?? "").trim(),
      year: safeNumber(form.get("year")),
      mileage: safeNumber(form.get("mileage")),
      notes: String(form.get("notes") ?? "").trim()
    };

    if (!updatedVehicle.name) return;

    onUpdate(updatedVehicle);
    setEditingVehicle(null);
    setSelectedVehicle(updatedVehicle);
  }

  function openEdit(vehicle: Vehicle) {
    setEditingVehicle(vehicle);
    setTimeout(() => {
      document.getElementById("vehicle-edit-panel")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }

  return (
    <div className="two-columns wide-left">
      <section className="property-grid">
        <div className="card asset-filter-card">
          <div>
            <p className="eyebrow">Filtres voitures</p>
            <h3>{visibleVehicles.length} voitures affichées</h3>
          </div>

          <div className="asset-filter-grid">
            <label>Statut
              <select value={vehicleStatusFilter} onChange={(event) => setVehicleStatusFilter(event.target.value as "Tous" | VehicleStatus)}>
                <option value="Tous">Tous</option>
                {vehicleStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>

            <label>Ville
              <input value={vehicleCityFilter} onChange={(event) => setVehicleCityFilter(event.target.value)} placeholder="Cannes, Monaco..." />
            </label>
          </div>
        </div>

        {visibleVehicles.length === 0 && (
          <div className="empty-state">
            <h3>Aucune voiture trouvée</h3>
            <p>Ajoutez un bien avec “Ajouter bien / voiture / bateau” ou modifiez les filtres.</p>
          </div>
        )}

        {visibleVehicles.map((vehicle) => (
          <article className="property-card" key={vehicle.id}>
            <div className="property-visual">
              <span>{vehicle.brand || "Voiture"}</span>
              <button className="asset-reset-button icon-button light" onClick={() => {
                const confirmed = window.confirm(`Supprimer "${vehicle.name}" ?`);
                if (confirmed) onDelete(vehicle.id);
              }} aria-label="Supprimer">×</button>
            </div>

            <div className="property-body">
              <div className="section-heading compact-heading">
                <div>
                  <h3>{vehicle.name}</h3>
                  <p>{vehicle.city || "Ville non renseignée"}</p>
                </div>
                <Badge>{vehicle.status}</Badge>
              </div>

              <dl className="property-meta">
                <div><dt>Prix / jour</dt><dd>{currency.format(vehicle.price)}</dd></div>
                <div><dt>Année</dt><dd>{vehicle.year || "—"}</dd></div>
                <div><dt>Kilométrage</dt><dd>{vehicle.mileage ? `${vehicle.mileage.toLocaleString("fr-FR")} km` : "—"}</dd></div>
                <div><dt>Owner</dt><dd>{vehicle.owner || "—"}</dd></div>
              </dl>

              <div className="asset-card-actions">
                <button className="asset-detail-button" type="button" onClick={() => setSelectedVehicle(vehicle)}>Détails</button>
                <button className="asset-edit-button" type="button" onClick={() => openEdit(vehicle)}>Modifier</button>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="card form-card">
        <p className="eyebrow">Nouveau</p>
        <h3>Ajouter une voiture</h3>

        <form className="form-grid" onSubmit={onAdd}>
          <label>Nom<input name="name" placeholder="Range Rover Autobiography" /></label>
          <label>Marque<input name="brand" placeholder="Land Rover" /></label>
          <label>Modèle<input name="model" placeholder="Range Rover" /></label>
          <label>Ville<input name="city" placeholder="Cannes" /></label>
          <label>Prix / jour<input name="price" type="number" min="0" placeholder="900" /></label>

          <label>Statut
            <select name="status">
              {vehicleStatuses.map((status) => <option key={status}>{status}</option>)}
            </select>
          </label>

          <label>Propriétaire<input name="owner" placeholder="Nom owner" /></label>
          <label>Année<input name="year" type="number" min="1900" placeholder="2024" /></label>
          <label>Kilométrage<input name="mileage" type="number" min="0" placeholder="12000" /></label>

          <button className="primary-button" type="submit">Ajouter</button>
        </form>
      </section>

      {selectedVehicle && (
        <div className="confirm-backdrop">
          <div className="confirm-dialog asset-detail-dialog" role="dialog" aria-modal="true">
            <p className="eyebrow">Fiche voiture</p>
            <h3>{selectedVehicle.name}</h3>

            <div className="asset-detail-grid">
              <div><span>Marque</span><strong>{selectedVehicle.brand || "—"}</strong></div>
              <div><span>Modèle</span><strong>{selectedVehicle.model || "—"}</strong></div>
              <div><span>Statut</span><strong>{selectedVehicle.status}</strong></div>
              <div><span>Ville</span><strong>{selectedVehicle.city || "—"}</strong></div>
              <div><span>Prix / jour</span><strong>{currency.format(selectedVehicle.price)}</strong></div>
              <div><span>Owner</span><strong>{selectedVehicle.owner || "—"}</strong></div>
              <div><span>Année</span><strong>{selectedVehicle.year || "—"}</strong></div>
              <div><span>Kilométrage</span><strong>{selectedVehicle.mileage ? `${selectedVehicle.mileage.toLocaleString("fr-FR")} km` : "—"}</strong></div>
              <div className="full"><span>Notes internes</span><p>{selectedVehicle.notes || "Aucune note interne."}</p></div>
            </div>

            <div className="asset-related-section">
              <p className="eyebrow">Leads liés à cette voiture</p>

              <div className="list-stack">
                {getVehicleLeads(selectedVehicle).length === 0 && (
                  <p className="muted-line">Aucun lead lié à cette voiture.</p>
                )}

                {getVehicleLeads(selectedVehicle).map((lead) => (
                  <article className="mini-row" key={lead.id}>
                    <div>
                      <strong>{lead.contactName}</strong>
                      <span>{lead.status} · {currency.format(lead.value)}</span>
                    </div>
                    <Badge>{lead.priority}</Badge>
                  </article>
                ))}
              </div>
            </div>

            <div className="confirm-actions">
              <button className="ghost-button" type="button" onClick={() => setSelectedVehicle(null)}>Fermer</button>
              <button className="primary-button" type="button" onClick={() => openEdit(selectedVehicle)}>Modifier</button>
            </div>
          </div>
        </div>
      )}

      {editingVehicle && (
        <div className="confirm-backdrop">
          <div id="vehicle-edit-panel" className="confirm-dialog edit-dialog" role="dialog" aria-modal="true">
            <p className="eyebrow">Modification</p>
            <h3>Modifier la voiture</h3>

            <form className="form-grid" onSubmit={submitEdit}>
              <label>Nom<input name="name" defaultValue={editingVehicle.name} /></label>
              <label>Marque<input name="brand" defaultValue={editingVehicle.brand} /></label>
              <label>Modèle<input name="model" defaultValue={editingVehicle.model} /></label>
              <label>Ville<input name="city" defaultValue={editingVehicle.city} /></label>
              <label>Prix / jour<input name="price" type="number" min="0" defaultValue={editingVehicle.price || ""} /></label>

              <label>Statut
                <select name="status" defaultValue={editingVehicle.status}>
                  {vehicleStatuses.map((status) => <option key={status}>{status}</option>)}
                </select>
              </label>

              <label>Propriétaire<input name="owner" defaultValue={editingVehicle.owner} /></label>
              <label>Année<input name="year" type="number" min="1900" defaultValue={editingVehicle.year || ""} /></label>
              <label>Kilométrage<input name="mileage" type="number" min="0" defaultValue={editingVehicle.mileage || ""} /></label>

              <label className="full">Notes internes
                <textarea name="notes" defaultValue={editingVehicle.notes ?? ""} />
              </label>

              <div className="confirm-actions full">
                <button className="ghost-button" type="button" onClick={() => setEditingVehicle(null)}>Annuler</button>
                <button className="primary-button" type="submit">Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function BoatsView({
  boats,
  leads,
  onAdd,
  onUpdate,
  onDelete
}: {
  boats: Boat[];
  leads: Lead[];
  onAdd: (event: React.FormEvent<HTMLFormElement>) => void;
  onUpdate: (boat: Boat) => void;
  onDelete: (id: string) => void;
}) {
  const [editingBoat, setEditingBoat] = useState<Boat | null>(null);
  const [selectedBoat, setSelectedBoat] = useState<Boat | null>(null);
  const [boatStatusFilter, setBoatStatusFilter] = useState<"Tous" | BoatStatus>("Tous");
  const [boatPortFilter, setBoatPortFilter] = useState("");

  const visibleBoats = boats.filter((boat) => {
    const statusMatches = boatStatusFilter === "Tous" || boat.status === boatStatusFilter;
    const portMatches = boat.port.toLowerCase().includes(boatPortFilter.toLowerCase().trim());
    return statusMatches && portMatches;
  });

  function getBoatLeads(boat: Boat) {
    return leads.filter((lead) => lead.assetType === "Boat" && lead.assetId === boat.id);
  }

  function submitEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingBoat) return;

    const form = new FormData(event.currentTarget);

    const updatedBoat: Boat = {
      ...editingBoat,
      name: String(form.get("name") ?? "").trim(),
      port: String(form.get("port") ?? "").trim(),
      type: String(form.get("type") ?? "").trim(),
      price: safeNumber(form.get("price")),
      status: String(form.get("status") ?? "Disponible") as BoatStatus,
      owner: String(form.get("owner") ?? "").trim(),
      year: safeNumber(form.get("year")),
      length: safeNumber(form.get("length")),
      notes: String(form.get("notes") ?? "").trim()
    };

    if (!updatedBoat.name) return;

    onUpdate(updatedBoat);
    setEditingBoat(null);
    setSelectedBoat(updatedBoat);
  }

  function openEdit(boat: Boat) {
    setEditingBoat(boat);
    setTimeout(() => {
      document.getElementById("boat-edit-panel")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }

  return (
    <div className="two-columns wide-left">
      <section className="property-grid">
        <div className="card asset-filter-card">
          <div>
            <p className="eyebrow">Filtres bateaux</p>
            <h3>{visibleBoats.length} bateaux affichés</h3>
          </div>

          <div className="asset-filter-grid">
            <label>Statut
              <select value={boatStatusFilter} onChange={(event) => setBoatStatusFilter(event.target.value as "Tous" | BoatStatus)}>
                <option value="Tous">Tous</option>
                {boatStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>

            <label>Port
              <input value={boatPortFilter} onChange={(event) => setBoatPortFilter(event.target.value)} placeholder="Cannes, Antibes..." />
            </label>
          </div>
        </div>

        {visibleBoats.length === 0 && (
          <div className="empty-state">
            <h3>Aucun bateau trouvé</h3>
            <p>Ajoutez un bien avec “Ajouter bien / voiture / bateau” ou modifiez les filtres.</p>
          </div>
        )}

        {visibleBoats.map((boat) => (
          <article className="property-card" key={boat.id}>
            <div className="property-visual">
              <span>{boat.type || "Bateau"}</span>
              <button className="icon-button light" onClick={() => {
                const confirmed = window.confirm(`Supprimer "${boat.name}" ?`);
                if (confirmed) onDelete(boat.id);
              }} aria-label="Supprimer">×</button>
            </div>

            <div className="property-body">
              <div className="section-heading compact-heading">
                <div>
                  <h3>{boat.name}</h3>
                  <p>{boat.port || "Port non renseigné"}</p>
                </div>
                <Badge>{boat.status}</Badge>
              </div>

              <dl className="property-meta">
                <div><dt>Prix / jour</dt><dd>{currency.format(boat.price)}</dd></div>
                <div><dt>Longueur</dt><dd>{boat.length ? `${boat.length} m` : "—"}</dd></div>
                <div><dt>Année</dt><dd>{boat.year || "—"}</dd></div>
                <div><dt>Owner</dt><dd>{boat.owner || "—"}</dd></div>
              </dl>

              <div className="asset-card-actions">
                <button className="asset-detail-button" type="button" onClick={() => setSelectedBoat(boat)}>Détails</button>
                <button className="asset-edit-button" type="button" onClick={() => openEdit(boat)}>Modifier</button>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="card form-card">
        <p className="eyebrow">Nouveau</p>
        <h3>Ajouter un bateau</h3>

        <form className="form-grid" onSubmit={onAdd}>
          <label>Nom<input name="name" placeholder="Sunseeker Manhattan 55" /></label>
          <label>Port<input name="port" placeholder="Cannes" /></label>
          <label>Type<input name="type" placeholder="Yacht, day boat..." /></label>
          <label>Prix / jour<input name="price" type="number" min="0" placeholder="4500" /></label>

          <label>Statut
            <select name="status">
              {boatStatuses.map((status) => <option key={status}>{status}</option>)}
            </select>
          </label>

          <label>Propriétaire<input name="owner" placeholder="Nom owner" /></label>
          <label>Année<input name="year" type="number" min="1900" placeholder="2021" /></label>
          <label>Longueur m<input name="length" type="number" min="0" placeholder="17" /></label>

          <button className="primary-button" type="submit">Ajouter</button>
        </form>
      </section>

      {selectedBoat && (
        <div className="confirm-backdrop">
          <div className="confirm-dialog asset-detail-dialog" role="dialog" aria-modal="true">
            <p className="eyebrow">Fiche bateau</p>
            <h3>{selectedBoat.name}</h3>

            <div className="asset-detail-grid">
              <div><span>Type</span><strong>{selectedBoat.type || "—"}</strong></div>
              <div><span>Port</span><strong>{selectedBoat.port || "—"}</strong></div>
              <div><span>Statut</span><strong>{selectedBoat.status}</strong></div>
              <div><span>Prix / jour</span><strong>{currency.format(selectedBoat.price)}</strong></div>
              <div><span>Owner</span><strong>{selectedBoat.owner || "—"}</strong></div>
              <div><span>Année</span><strong>{selectedBoat.year || "—"}</strong></div>
              <div><span>Longueur</span><strong>{selectedBoat.length ? `${selectedBoat.length} m` : "—"}</strong></div>
              <div className="full"><span>Notes internes</span><p>{selectedBoat.notes || "Aucune note interne."}</p></div>
            </div>

            <div className="asset-related-section">
              <p className="eyebrow">Leads liés à ce bateau</p>

              <div className="list-stack">
                {getBoatLeads(selectedBoat).length === 0 && (
                  <p className="muted-line">Aucun lead lié à ce bateau.</p>
                )}

                {getBoatLeads(selectedBoat).map((lead) => (
                  <article className="mini-row" key={lead.id}>
                    <div>
                      <strong>{lead.contactName}</strong>
                      <span>{lead.status} · {currency.format(lead.value)}</span>
                    </div>
                    <Badge>{lead.priority}</Badge>
                  </article>
                ))}
              </div>
            </div>

            <div className="confirm-actions">
              <button className="ghost-button" type="button" onClick={() => setSelectedBoat(null)}>Fermer</button>
              <button className="primary-button" type="button" onClick={() => openEdit(selectedBoat)}>Modifier</button>
            </div>
          </div>
        </div>
      )}

      {editingBoat && (
        <div className="confirm-backdrop">
          <div id="boat-edit-panel" className="confirm-dialog edit-dialog" role="dialog" aria-modal="true">
            <p className="eyebrow">Modification</p>
            <h3>Modifier le bateau</h3>

            <form className="form-grid" onSubmit={submitEdit}>
              <label>Nom<input name="name" defaultValue={editingBoat.name} /></label>
              <label>Port<input name="port" defaultValue={editingBoat.port} /></label>
              <label>Type<input name="type" defaultValue={editingBoat.type} /></label>
              <label>Prix / jour<input name="price" type="number" min="0" defaultValue={editingBoat.price || ""} /></label>

              <label>Statut
                <select name="status" defaultValue={editingBoat.status}>
                  {boatStatuses.map((status) => <option key={status}>{status}</option>)}
                </select>
              </label>

              <label>Propriétaire<input name="owner" defaultValue={editingBoat.owner} /></label>
              <label>Année<input name="year" type="number" min="1900" defaultValue={editingBoat.year || ""} /></label>
              <label>Longueur m<input name="length" type="number" min="0" defaultValue={editingBoat.length || ""} /></label>

              <label className="full">Notes internes
                <textarea name="notes" defaultValue={editingBoat.notes ?? ""} />
              </label>

              <div className="confirm-actions full">
                <button className="ghost-button" type="button" onClick={() => setEditingBoat(null)}>Annuler</button>
                <button className="primary-button" type="submit">Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


function TasksView({
  tasks,
  leads,
  preselectedLeadId,
  prefilledTitle,
  onAdd,
  onUpdate,
  onStatusChange,
  onDelete
}: {
  tasks: Task[];
  leads: Lead[];
  preselectedLeadId?: string;
  prefilledTitle?: string;
  onAdd: (event: React.FormEvent<HTMLFormElement>) => void;
  onUpdate: (task: Task) => void;
  onStatusChange: (id: string, status: TaskStatus) => void;
  onDelete: (id: string) => void;
}) {
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  function getLinkedLeadLabel(linkedTo: string) {
    if (!linkedTo) return "Aucun lead lié";

    const lead = leads.find((item) => item.id === linkedTo);

    if (!lead) return linkedTo;

    return `${lead.category} • ${lead.contactName}`;
  }

  function submitEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingTask) return;

    const form = new FormData(event.currentTarget);

    const updatedTask: Task = {
      ...editingTask,
      title: String(form.get("title") ?? "").trim(),
      owner: String(form.get("owner") ?? "").trim(),
      status: String(form.get("status") ?? "À faire") as TaskStatus,
      dueDate: String(form.get("dueDate") ?? ""),
      linkedTo: String(form.get("linkedTo") ?? "").trim()
    };

    if (!updatedTask.title) return;

    onUpdate(updatedTask);
    setEditingTask(null);
  }

  function openEdit(task: Task) {
    setEditingTask(task);

    setTimeout(() => {
      document.getElementById("task-edit-panel")?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }, 50);
  }

  return (
    <div className="two-columns wide-left">
      <section className="card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Suivi</p>
            <h3>{tasks.length} tâche{tasks.length > 1 ? "s" : ""}</h3>
          </div>
        </div>

        {tasks.length === 0 ? (
          <div className="empty-state">
            <h3>Aucune tâche pour le moment</h3>
            <p>Ajoutez une tâche depuis un lead, un contact, ou utilisez le formulaire de création.</p>
          </div>
        ) : (
          <div className="pipeline-grid">
            {taskStatuses.map((status) => {
              const columnTasks = tasks.filter((task) => task.status === status);

              return (
                <div className="pipeline-column" key={status}>
                  <div className="pipeline-title">
                    <strong>{status}</strong>
                    <span>{columnTasks.length}</span>
                  </div>

                  <div className="list-stack">
                    {columnTasks.length === 0 ? (
                      <p className="muted-line">Aucune tâche.</p>
                    ) : (
                      columnTasks.map((task) => {
                        const linkedLead = leads.find((lead) => lead.id === task.linkedTo);

                        return (
                          <article className="task-row" key={task.id}>
                            <div>
                              <strong>{task.title}</strong>
                              <small>
                                {task.owner || "Responsable non renseigné"} ·{" "}
                                <span className={`due-label ${getDueStatus(task.dueDate)}`}>
                                  {getDueLabel(task.dueDate)}
                                </span>
                              </small>

                              {linkedLead && (
                                <small>
                                  Lead lié : {linkedLead.category} · {linkedLead.contactName}
                                </small>
                              )}

                              <button
                                className="task-edit-button"
                                type="button"
                                onClick={() => openEdit(task)}
                              >
                                Modifier
                              </button>
                            </div>

                            <div className="task-actions">
                              <select value={task.status} onChange={(event) => onStatusChange(task.id, event.target.value as TaskStatus)}>
                                {taskStatuses.map((option) => <option key={option}>{option}</option>)}
                              </select>

                              <button
                                className="icon-button"
                                type="button"
                                onClick={() => {
                                  const confirmed = window.confirm(`Supprimer la tâche "${task.title}" ?`);

                                  if (confirmed) {
                                    onDelete(task.id);
                                  }
                                }}
                                aria-label="Supprimer"
                              >
                                ×
                              </button>
                            </div>
                          </article>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section id="task-create-form" className="card form-card">
        <p className="eyebrow">Nouvelle</p>
        <h3>Ajouter une tâche</h3>

        <form className="form-grid" onSubmit={onAdd}>
          <label>Titre<input name="title" placeholder="Envoyer proposition" defaultValue={prefilledTitle || ""} /></label>
          <label>Responsable<input name="owner" placeholder="Matteo" /></label>

          <label>Statut
            <select name="status">
              {taskStatuses.map((status) => <option key={status}>{status}</option>)}
            </select>
          </label>

          <label>Échéance<input name="dueDate" type="date" /></label>

          <label className="full">Lead lié
            <select name="linkedTo" defaultValue={preselectedLeadId || ""}>
              <option value="">Aucun lead lié</option>
              {leads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.category} • {lead.contactName}
                </option>
              ))}
            </select>
          </label>

          <button className="primary-button" type="submit">Ajouter</button>
        </form>
      </section>

      {editingTask && (
        <div className="confirm-backdrop">
          <div id="task-edit-panel" className="confirm-dialog edit-dialog" role="dialog" aria-modal="true">
            <p className="eyebrow">Modification</p>
            <h3>Modifier la tâche</h3>

            <form className="form-grid" onSubmit={submitEdit}>
              <label>Titre<input name="title" defaultValue={editingTask.title} /></label>
              <label>Responsable<input name="owner" defaultValue={editingTask.owner} /></label>

              <label>Statut
                <select name="status" defaultValue={editingTask.status}>
                  {taskStatuses.map((status) => <option key={status}>{status}</option>)}
                </select>
              </label>

              <label>Échéance<input name="dueDate" type="date" defaultValue={editingTask.dueDate} /></label>

              <label className="full">Lead lié
                <select name="linkedTo" defaultValue={editingTask.linkedTo}>
                  <option value="">Aucun lead lié</option>
                  {leads.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.category} • {lead.contactName}
                    </option>
                  ))}
                </select>
              </label>

              <div className="confirm-actions full">
                <button className="ghost-button" type="button" onClick={() => setEditingTask(null)}>
                  Annuler
                </button>

                <button className="primary-button" type="submit">
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


function Badge({ children }: { children: React.ReactNode }) {
  return <span className="badge">{children}</span>;
}

function LoginView() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanEmail = email.trim();

    if (!cleanEmail) {
      setMessage("Renseigne ton email.");
      return;
    }

    setIsSubmitting(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        emailRedirectTo: window.location.origin,
        shouldCreateUser: false
      }
    });

    setIsSubmitting(false);

    if (error) {
      setMessage(`Erreur connexion : ${error.message}`);
      return;
    }

    setMessage("Lien de connexion envoyé. Ouvre ta boîte mail et clique sur le lien.");
  }

  return (
    <main className="crm-shell">
      <section className="card form-card">
        <p className="eyebrow">Accès sécurisé</p>
        <h1>Connexion CRM</h1>
        <p className="muted-line">
          Entre ton email autorisé. Supabase t’enverra un lien de connexion sécurisé.
        </p>

        <form className="form-grid" onSubmit={handleLogin}>
          <label className="full">Email
            <input
              type="email"
              value={email}
              placeholder="ton@email.com"
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Envoi..." : "Recevoir le lien"}
          </button>
        </form>

        {message && <p className="muted-line">{message}</p>}
      </section>
    </main>
  );
}

export default function CRMApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;

      setSession(data.session);
      setAuthLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  async function logout() {
    await supabase.auth.signOut();
  }

  if (authLoading) {
    return (
      <main className="crm-shell">
        <section className="card">
          <p className="eyebrow">Connexion</p>
          <h1>Chargement...</h1>
        </section>
      </main>
    );
  }

  if (!session) {
    return <LoginView />;
  }

  return <CRMAppContent sessionEmail={session.user.email ?? "utilisateur"} onLogout={logout} />;
}

