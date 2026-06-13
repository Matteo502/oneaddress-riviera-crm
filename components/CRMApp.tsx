"use client";

import QuickRepliesView from "./QuickRepliesView";

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
  TaskStatus,
  Supplier,
  PlanningEntry,
  PlanningEntryType,
  VendorInvoice,
  HouseTrackingHouse,
  HouseTrackingWorker,
  HouseTimeEntry,
  HousePayment,
} from "@/lib/types";

const STORAGE_KEY = "oneaddress-riviera-crm-v1";
const QUOTES_STORAGE_KEY = "oneaddress-riviera-crm-quotes-v1";
const ACTOR_STORAGE_KEY = "oneaddress-riviera-crm-active-actor-v1";
const SHARED_WORKSPACE_ID = "oneaddress-riviera";
const leadStatuses: LeadStatus[] = ["Nouveau", "Contacté", "Devis", "Négociation", "Gagné", "Perdu"];
const propertyStatuses: PropertyStatus[] = ["Disponible", "Mandat en cours", "Loué", "Vendu"];
const vehicleStatuses: VehicleStatus[] = ["Disponible", "En location", "En maintenance", "Vendu"];
const boatStatuses: BoatStatus[] = ["Disponible", "En charter", "En maintenance", "Vendu"];
const taskStatuses: TaskStatus[] = ["À faire", "En cours", "Terminé"];
const contactKinds: ContactKind[] = ["Client", "Fournisseur", "Propriétaire", "Partenaire"];
const contactLevels = ["Standard", "VIP", "Ultra VIP"] as const;
const contactLanguages = ["Français", "Anglais", "Italien", "Autre"] as const;
const contactRelationshipStatuses = ["Prospect", "Actif", "Dormant"] as const;
const supplierCategories = ["Villa", "Voiture", "Bateau", "Chauffeur", "Chef", "Sécurité", "Conciergerie", "Paysagiste", "Gestion nuisibles", "Pisciniste", "Femme de ménage", "Nounou", "Artisan rénovation", "Lavage voiture", "Garage / mécanicien", "Jardinier", "Autre"] as const;
const crmActors = ["Matteo", "Vincent"] as const;
type CRMActor = typeof crmActors[number];

const emptyData: CRMData = {
  contacts: [],
  leads: [],
  properties: [],
  vehicles: [],
  boats: [],
  tasks: [],
  suppliers: [],
  planningEntries: [],
  quotes: [],
  vendorInvoices: [],
  houseTrackingHouses: [],
  houseTrackingWorkers: [],
  houseTimeEntries: [],
  housePayments: []
};


function isSupplierContact(contact: Contact) {
  return contact.kind === "Fournisseur" || Boolean(contact.supplierCategory);
}

function getContactSupplierCategory(contact: Contact) {
  return contact.supplierCategory || "Autre";
}

function getContactSupplierZone(contact: Contact) {
  return contact.supplierZone || contact.city || "";
}

function supplierToContact(supplier: Supplier): Contact {
  const supplierName = String(supplier.name || "").trim();
  const contactName = String(supplier.contactName || "").trim();
  const notes = [
    supplier.notes ? supplier.notes : "",
    supplier.priceNotes ? `Prix : ${supplier.priceNotes}` : "",
    supplier.commissionNotes ? `Commission / marge : ${supplier.commissionNotes}` : ""
  ].filter(Boolean).join("\n");

  return {
    id: `contact-${supplier.id}`,
    name: supplierName || contactName || "Fournisseur à compléter",
    kind: "Fournisseur",
    email: supplier.email || "",
    phone: supplier.phone || "",
    city: supplier.zone || "",
    postalAddress: supplier.zone || "",
    budget: 0,
    source: "Ancien module Fournisseurs",
    notes,
    clientLevel: "Standard",
    preferredLanguage: "Français",
    relationshipStatus: supplier.status === "Inactif" ? "Dormant" : supplier.status === "À vérifier" ? "Prospect" : "Actif",
    preferences: supplier.category || "",
    importantNotes: supplier.reliability === "À éviter" ? "À éviter" : "",
    supplierCategory: supplier.category || "Autre",
    supplierContactName: contactName,
    supplierZone: supplier.zone || "",
    supplierQuality: supplier.quality || "Standard",
    supplierReliability: supplier.reliability || "À tester",
    supplierPriceNotes: supplier.priceNotes || "",
    supplierCommissionNotes: supplier.commissionNotes || "",
    supplierStatus: supplier.status || "Actif",
    createdAt: String(supplier.createdAt || new Date().toISOString()).slice(0, 10)
  };
}

function mergeContactsWithLegacySuppliers(contacts: Contact[], suppliers: Supplier[]) {
  const merged = [...contacts];
  const existingKeys = new Set(
    merged.map((contact) => [contact.id, contact.name, contact.email, contact.phone].map((value) => String(value || "").trim().toLowerCase()).join("|"))
  );

  suppliers.forEach((supplier) => {
    const contact = supplierToContact(supplier);
    const key = [contact.id, contact.name, contact.email, contact.phone].map((value) => String(value || "").trim().toLowerCase()).join("|");
    const looseDuplicate = merged.some((existing) => {
      const sameName = existing.name && contact.name && existing.name.trim().toLowerCase() === contact.name.trim().toLowerCase();
      const sameEmail = existing.email && contact.email && existing.email.trim().toLowerCase() === contact.email.trim().toLowerCase();
      const samePhone = existing.phone && contact.phone && existing.phone.trim().toLowerCase() === contact.phone.trim().toLowerCase();
      return sameName || sameEmail || samePhone;
    });

    if (!existingKeys.has(key) && !looseDuplicate) {
      merged.push(contact);
      existingKeys.add(key);
    }
  });

  return merged;
}

function normalizeSharedCRMData(payload: any): CRMData {
  const contacts = Array.isArray(payload?.contacts) ? payload.contacts as Contact[] : [];
  const legacySuppliers = Array.isArray(payload?.suppliers) ? payload.suppliers as Supplier[] : [];

  return {
    contacts: mergeContactsWithLegacySuppliers(contacts, legacySuppliers),
    leads: Array.isArray(payload?.leads) ? payload.leads : [],
    properties: Array.isArray(payload?.properties) ? payload.properties : [],
    vehicles: Array.isArray(payload?.vehicles) ? payload.vehicles : [],
    boats: Array.isArray(payload?.boats) ? payload.boats : [],
    tasks: Array.isArray(payload?.tasks) ? payload.tasks : [],
    suppliers: [],
    planningEntries: Array.isArray(payload?.planningEntries) ? payload.planningEntries : [],
    quotes: Array.isArray(payload?.quotes)
      ? payload.quotes.map(normalizeQuoteRequest).filter((quote: QuoteRequest | null): quote is QuoteRequest => Boolean(quote))
      : [],
    vendorInvoices: Array.isArray(payload?.vendorInvoices)
      ? payload.vendorInvoices.map(normalizeVendorInvoice).filter((invoice: VendorInvoice | null): invoice is VendorInvoice => Boolean(invoice))
      : [],
    houseTrackingHouses: Array.isArray(payload?.houseTrackingHouses)
      ? payload.houseTrackingHouses.map(normalizeHouseTrackingHouse).filter((house: HouseTrackingHouse | null): house is HouseTrackingHouse => Boolean(house))
      : [],
    houseTrackingWorkers: Array.isArray(payload?.houseTrackingWorkers)
      ? payload.houseTrackingWorkers.map(normalizeHouseTrackingWorker).filter((worker: HouseTrackingWorker | null): worker is HouseTrackingWorker => Boolean(worker))
      : [],
    houseTimeEntries: Array.isArray(payload?.houseTimeEntries)
      ? payload.houseTimeEntries.map(normalizeHouseTimeEntry).filter((entry: HouseTimeEntry | null): entry is HouseTimeEntry => Boolean(entry))
      : [],
    housePayments: Array.isArray(payload?.housePayments)
      ? payload.housePayments.map(normalizeHousePayment).filter((payment: HousePayment | null): payment is HousePayment => Boolean(payment))
      : []
  };
}
function crmDataHasContent(value: CRMData) {
  return (
    value.contacts.length > 0 ||
    value.leads.length > 0 ||
    value.properties.length > 0 ||
    value.vehicles.length > 0 ||
    value.boats.length > 0 ||
    value.tasks.length > 0 ||
    (((value as any).suppliers ?? []) as Supplier[]).length > 0 ||
    (((value as any).planningEntries ?? []) as PlanningEntry[]).length > 0 ||
    (((value as any).quotes ?? []) as QuoteRequest[]).length > 0 ||
    (((value as any).vendorInvoices ?? []) as VendorInvoice[]).length > 0 ||
    (((value as any).houseTrackingHouses ?? []) as HouseTrackingHouse[]).length > 0 ||
    (((value as any).houseTrackingWorkers ?? []) as HouseTrackingWorker[]).length > 0 ||
    (((value as any).houseTimeEntries ?? []) as HouseTimeEntry[]).length > 0 ||
    (((value as any).housePayments ?? []) as HousePayment[]).length > 0
  );
}

function readLocalCRMDataSafely() {
  if (typeof window === "undefined") return emptyData;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return normalizeSharedCRMData(raw ? JSON.parse(raw) : null);
  } catch {
    return emptyData;
  }
}

type Tab = "dashboard" | "contacts" | "leads" | "tasks" | "quotes" | "bookings" | "vendorInvoices" | "houseTracking" | "quickReplies" | "planning" | "properties" | "vehicles" | "boats";

type Toast = {
  message: string;
  tone: "success" | "warning";
};

type ActionNotification = {
  id: string;
  title: string;
  detail: string;
  tab: Tab;
  tone: "danger" | "warning" | "info";
  targetId?: string;
};

const currency = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0
});


function normalizeVendorInvoice(value: unknown): VendorInvoice | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;
  const amount = Number(raw.amount || 0);
  const paidAmount = Number(raw.paidAmount || 0);
  const status = String(raw.status || getVendorInvoiceStatus(amount, paidAmount, String(raw.dueDate || ""))) as VendorInvoice["status"];

  return {
    id: String(raw.id || makeId("invoice")),
    contactId: String(raw.contactId || ""),
    contactName: String(raw.contactName || ""),
    category: String(raw.category || "Fournisseur"),
    title: String(raw.title || "Facture fournisseur"),
    invoiceDate: String(raw.invoiceDate || ""),
    dueDate: String(raw.dueDate || ""),
    amount: Number.isFinite(amount) ? amount : 0,
    paidAmount: Number.isFinite(paidAmount) ? paidAmount : 0,
    status: getVendorInvoiceStatusFromValue(status),
    paymentMethod: String(raw.paymentMethod || ""),
    notes: String(raw.notes || ""),
    createdAt: String(raw.createdAt || new Date().toISOString())
  };
}

function getVendorInvoiceStatusFromValue(value: unknown): VendorInvoice["status"] {
  if (
    value === "À payer" ||
    value === "Partiellement payé" ||
    value === "Payé" ||
    value === "En retard" ||
    value === "Annulé"
  ) {
    return value;
  }

  return "À payer";
}

function getVendorInvoiceStatus(amount: number, paidAmount: number, dueDate?: string): VendorInvoice["status"] {
  if (amount > 0 && paidAmount >= amount) return "Payé";
  if (paidAmount > 0 && paidAmount < amount) return "Partiellement payé";

  if (dueDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const due = new Date(`${dueDate}T00:00:00`);
    due.setHours(0, 0, 0, 0);

    if (!Number.isNaN(due.getTime()) && due.getTime() < today.getTime()) {
      return "En retard";
    }
  }

  return "À payer";
}

function getVendorInvoiceRemaining(invoice: VendorInvoice) {
  return Math.max(Number(invoice.amount || 0) - Number(invoice.paidAmount || 0), 0);
}

function normalizeHouseTrackingHouse(value: unknown): HouseTrackingHouse | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;

  return {
    id: String(raw.id || makeId("house")),
    name: String(raw.name || "Maison à compléter"),
    address: String(raw.address || ""),
    notes: String(raw.notes || ""),
    createdAt: String(raw.createdAt || new Date().toISOString()),
    createdBy: raw.createdBy ? String(raw.createdBy) : undefined,
    updatedBy: raw.updatedBy ? String(raw.updatedBy) : undefined,
    updatedAt: raw.updatedAt ? String(raw.updatedAt) : undefined
  };
}

function normalizeHouseTrackingWorker(value: unknown): HouseTrackingWorker | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;
  const hourlyRate = Number(raw.hourlyRate || 0);

  return {
    id: String(raw.id || makeId("worker")),
    contactId: String(raw.contactId || ""),
    contactName: String(raw.contactName || "Intervenant à compléter"),
    role: String(raw.role || "Intervenant"),
    hourlyRate: Number.isFinite(hourlyRate) ? hourlyRate : 0,
    status: raw.status === "Inactif" ? "Inactif" : "Actif",
    notes: String(raw.notes || ""),
    createdAt: String(raw.createdAt || new Date().toISOString()),
    createdBy: raw.createdBy ? String(raw.createdBy) : undefined,
    updatedBy: raw.updatedBy ? String(raw.updatedBy) : undefined,
    updatedAt: raw.updatedAt ? String(raw.updatedAt) : undefined
  };
}

function normalizeHouseTimeEntry(value: unknown): HouseTimeEntry | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;
  const breakMinutes = Number(raw.breakMinutes || 0);
  const hourlyRate = Number(raw.hourlyRate || 0);

  return {
    id: String(raw.id || makeId("hours")),
    houseId: String(raw.houseId || ""),
    houseName: String(raw.houseName || "Maison"),
    workerId: String(raw.workerId || ""),
    workerName: String(raw.workerName || "Intervenant"),
    date: String(raw.date || new Date().toISOString().slice(0, 10)),
    startTime: String(raw.startTime || ""),
    endTime: String(raw.endTime || ""),
    breakMinutes: Number.isFinite(breakMinutes) ? breakMinutes : 0,
    hourlyRate: Number.isFinite(hourlyRate) ? hourlyRate : 0,
    note: String(raw.note || ""),
    createdAt: String(raw.createdAt || new Date().toISOString()),
    createdBy: raw.createdBy ? String(raw.createdBy) : undefined,
    updatedBy: raw.updatedBy ? String(raw.updatedBy) : undefined,
    updatedAt: raw.updatedAt ? String(raw.updatedAt) : undefined
  };
}

function normalizeHousePayment(value: unknown): HousePayment | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;
  const amount = Number(raw.amount || 0);
  const methodValue = String(raw.method || "Virement");
  const method = (methodValue === "Espèces" || methodValue === "CB" || methodValue === "Chèque" || methodValue === "Autre" ? methodValue : "Virement") as HousePayment["method"];

  return {
    id: String(raw.id || makeId("payment")),
    houseId: String(raw.houseId || ""),
    houseName: String(raw.houseName || "Maison"),
    workerId: String(raw.workerId || ""),
    workerName: String(raw.workerName || "Intervenant"),
    date: String(raw.date || new Date().toISOString().slice(0, 10)),
    amount: Number.isFinite(amount) ? amount : 0,
    method,
    note: String(raw.note || ""),
    createdAt: String(raw.createdAt || new Date().toISOString()),
    createdBy: raw.createdBy ? String(raw.createdBy) : undefined,
    updatedBy: raw.updatedBy ? String(raw.updatedBy) : undefined,
    updatedAt: raw.updatedAt ? String(raw.updatedAt) : undefined
  };
}

function getHouseTimeHours(entry: Pick<HouseTimeEntry, "startTime" | "endTime" | "breakMinutes">) {
  if (!entry.startTime || !entry.endTime) return 0;

  const [startHour, startMinute] = entry.startTime.split(":").map(Number);
  const [endHour, endMinute] = entry.endTime.split(":").map(Number);

  if (![startHour, startMinute, endHour, endMinute].every(Number.isFinite)) return 0;

  const startTotal = startHour * 60 + startMinute;
  const endTotal = endHour * 60 + endMinute;
  const rawMinutes = endTotal - startTotal - Number(entry.breakMinutes || 0);

  return Math.max(rawMinutes / 60, 0);
}

function getHouseTimeAmount(entry: Pick<HouseTimeEntry, "startTime" | "endTime" | "breakMinutes" | "hourlyRate">) {
  return getHouseTimeHours(entry) * Number(entry.hourlyRate || 0);
}

function getCurrentMonthValue() {
  return new Date().toISOString().slice(0, 7);
}

function getMonthFromDate(value?: string) {
  return String(value || "").slice(0, 7);
}

function formatHours(value: number) {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value)} h`;
}

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

type ActionTrackedItem = {
  createdBy?: string;
  updatedBy?: string;
  updatedAt?: string;
  createdAt?: string;
};

function isCRMActor(value: string | null): value is CRMActor {
  return value === "Matteo" || value === "Vincent";
}

function stampCreated<T extends object>(item: T, actor: string): T {
  const now = new Date().toISOString();

  return {
    ...item,
    createdBy: actor,
    updatedBy: actor,
    updatedAt: now
  };
}

function stampUpdated<T extends object>(item: T, actor: string): T {
  return {
    ...item,
    updatedBy: actor,
    updatedAt: new Date().toISOString()
  };
}

function formatDateTimeFR(value?: string) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function getActionMetaLabel(item: ActionTrackedItem) {
  const actor = item.updatedBy || item.createdBy;

  if (!actor) return "Action non attribuée";

  const dateLabel = formatDateTimeFR(item.updatedAt || item.createdAt);
  return dateLabel ? `Dernière action : ${actor} · ${dateLabel}` : `Dernière action : ${actor}`;
}

function ActionMeta({ item }: { item: ActionTrackedItem }) {
  return <small className="action-meta">{getActionMetaLabel(item)}</small>;
}


function contactToSupabaseRow(contact: Contact, userId: string) {
  return {
    id: contact.id,
    user_id: userId,
    name: contact.name,
    kind: contact.kind || "Client",
    client_level: contact.clientLevel || "Standard",
    preferred_language: contact.preferredLanguage || "Français",
    relationship_status: contact.relationshipStatus || "Prospect",
    email: contact.email || "",
    phone: contact.phone || "",
    city: contact.city || "",
    postal_address: contact.postalAddress || "",
    budget: contact.budget || 0,
    source: contact.source || "",
    preferences: contact.preferences || "",
    important_notes: contact.importantNotes || "",
    notes: contact.notes || "",
    updated_at: new Date().toISOString()
  };
}

function contactFromSupabaseRow(row: any): Contact {
  return {
    id: String(row.id || makeId("contact")),
    name: String(row.name || ""),
    kind: String(row.kind || "Client") as ContactKind,
    clientLevel: String(row.client_level || "Standard") as Contact["clientLevel"],
    preferredLanguage: String(row.preferred_language || "Français") as Contact["preferredLanguage"],
    relationshipStatus: String(row.relationship_status || "Prospect") as Contact["relationshipStatus"],
    email: String(row.email || ""),
    phone: String(row.phone || ""),
    city: String(row.city || ""),
    postalAddress: String(row.postal_address || ""),
    budget: Number(row.budget || 0),
    source: String(row.source || ""),
    preferences: String(row.preferences || ""),
    importantNotes: String(row.important_notes || ""),
    notes: String(row.notes || ""),
    createdAt: String(row.created_at || new Date().toISOString()).slice(0, 10)
  };
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
    },
    {
      title: "PLANNING",
      headers: ["Titre", "Type", "Contact", "Actif", "Date début", "Date fin", "Bloque disponibilité", "Notes"],
      rows: ((data as any).planningEntries ?? []).map((entry: PlanningEntry) => [
        entry.title,
        entry.type,
        entry.contactName,
        entry.assetId || "",
        entry.startDate,
        entry.endDate,
        entry.blocksAvailability ? "Oui" : "Non",
        entry.notes ?? ""
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

type QuoteStatus = "Draft" | "Sent" | "Negotiation" | "Accepted" | "Declined";

type QuoteRequest = {
  id: string;
  leadId?: string;
  clientName: string;
  title: string;
  location: string;
  guestCount: string;
  categories: string[];
  items?: QuoteLine[];
  startDate: string;
  endDate: string;
  unitPrice: number;
  supplierCost?: number;
  depositReceived?: number;
  balanceReceived?: number;
  paymentNotes?: string;
  paymentStatus?: "Non payé" | "Acompte reçu" | "Partiel" | "Payé" | "Annulé / remboursé";
  expectedDeposit?: number;
  paymentDueDate?: string;
  bookingStatus?: "À préparer" | "Prestataire à confirmer" | "Confirmé" | "En cours" | "Terminé" | "Annulé";
  clientConfirmed?: boolean;
  depositConfirmed?: boolean;
  supplierConfirmed?: boolean;
  balanceConfirmed?: boolean;
  detailsSent?: boolean;
  serviceCompleted?: boolean;
  operationNotes?: string;
  assignedContactId?: string;
  validityDate: string;
  paymentTerms: string;
  cancellationTerms: string;
  included: string;
  excluded: string;
  notes: string;
  status: QuoteStatus;
  statusUpdatedAt?: string;
  createdAt: string;
  createdBy?: string;
  updatedBy?: string;
  updatedAt?: string;
};

type QuoteLeadDraft = {
  key: string;
  leadId?: string;
  quoteId?: string;
  clientName: string;
  category: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  unitPrice: number;
  notes: string;
};


const quoteStatuses: QuoteStatus[] = ["Draft", "Sent", "Negotiation", "Accepted", "Declined"];

function getQuoteStatus(value: unknown): QuoteStatus {
  if (value === "Sent" || value === "Negotiation" || value === "Accepted" || value === "Declined" || value === "Draft") {
    return value;
  }

  return "Draft";
}

function getQuoteStatusLabel(status: QuoteStatus) {
  const labels: Record<QuoteStatus, string> = {
    Draft: "Draft",
    Sent: "Sent",
    Negotiation: "Negotiation",
    Accepted: "Accepted",
    Declined: "Declined"
  };

  return labels[status];
}

function getQuoteStatusFrenchLabel(status: QuoteStatus) {
  const labels: Record<QuoteStatus, string> = {
    Draft: "Brouillon",
    Sent: "Envoyé",
    Negotiation: "Négociation",
    Accepted: "Gagné",
    Declined: "Perdu"
  };

  return labels[status];
}



function getLeadStatusFromQuoteStatus(status: QuoteStatus): LeadStatus {
  if (status === "Draft") return "Nouveau";
  if (status === "Sent") return "Contacté";
  if (status === "Negotiation") return "Négociation";
  if (status === "Accepted") return "Gagné";
  if (status === "Declined") return "Perdu";

  return "Nouveau";
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
  popup.document.write(addQuoteDownloadToolbar(`<!doctype html>
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
  

</main>

  <script>
    window.onload = () => {
      window.focus();
      window.print();
    };
  </script>
</body>
</html>`));
  popup.document.close();
}


function normalizeQuoteRequest(value: unknown): QuoteRequest | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;

  return {
    ...raw,
    id: String(raw.id || createQuoteId()),
    leadId: raw.leadId ? String(raw.leadId) : undefined,
    clientName: String(raw.clientName || ""),
    categories: Array.isArray(raw.categories) ? raw.categories.map(String) : [],
    startDate: String(raw.startDate || ""),
    endDate: String(raw.endDate || ""),
    unitPrice: Number.isFinite(Number(raw.unitPrice)) ? Number(raw.unitPrice) : 0,
    notes: String(raw.notes || ""),
    status: getQuoteStatus(raw.status),
    statusUpdatedAt: String(raw.statusUpdatedAt || raw.createdAt || new Date().toISOString()),
    paymentStatus: String(raw.paymentStatus || "Non payé") as QuoteRequest["paymentStatus"],
    expectedDeposit: Number(raw.expectedDeposit || 0),
    paymentDueDate: String(raw.paymentDueDate || ""),
    bookingStatus: String(raw.bookingStatus || "À préparer") as QuoteRequest["bookingStatus"],
    clientConfirmed: Boolean(raw.clientConfirmed),
    depositConfirmed: Boolean(raw.depositConfirmed),
    supplierConfirmed: Boolean(raw.supplierConfirmed),
    balanceConfirmed: Boolean(raw.balanceConfirmed),
    detailsSent: Boolean(raw.detailsSent),
    serviceCompleted: Boolean(raw.serviceCompleted),
    operationNotes: String(raw.operationNotes || ""),
    assignedContactId: String(raw.assignedContactId || ""),
    createdBy: raw.createdBy ? String(raw.createdBy) : undefined,
    updatedBy: raw.updatedBy ? String(raw.updatedBy) : undefined,
    updatedAt: raw.updatedAt ? String(raw.updatedAt) : undefined,
    createdAt: String(raw.createdAt || new Date().toISOString())
  } as QuoteRequest;
}


function mergeQuoteRequests(sharedQuotes: QuoteRequest[], localQuotes: QuoteRequest[]) {
  const byId = new Map<string, QuoteRequest>();

  sharedQuotes.forEach((quote) => byId.set(quote.id, quote));
  localQuotes.forEach((quote) => byId.set(quote.id, quote));

  return Array.from(byId.values()).sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
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




function getQuoteCategoryFromLead(lead: Lead) {
  if (lead.assetType === "Boat") return "Bateau";
  if (lead.assetType === "Vehicle") return "Voiture";

  return lead.category || "Villa";
}

function createDraftQuoteFromLead(lead: Lead): QuoteRequest {
  const category = getQuoteCategoryFromLead(lead);
  const value = Number(lead.value || 0);
  const title = `${category} · ${lead.contactName}`;

  return {
    id: createQuoteId(),
    leadId: lead.id,
    clientName: lead.contactName,
    title,
    location: "",
    guestCount: "",
    categories: [category],
    items: [
      {
        id: createQuoteId(),
        category,
        description: title,
        unitPrice: value,
        billingUnit: "fixed",
        deposit: 0
      }
    ],
    startDate: lead.rentalStartDate || "",
    endDate: lead.rentalEndDate || "",
    unitPrice: value,
    validityDate: "",
    paymentTerms: "",
    cancellationTerms: "",
    included: "",
    excluded: "",
    notes: lead.notes || "",
    status: "Draft",
    createdAt: new Date().toISOString()
  };
}

function addQuoteDownloadToolbar(html: string) {
  const toolbar = `
    <style>
      .quote-actions-bar {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 99999;
        display: flex;
        justify-content: center;
        gap: 12px;
        padding: 14px 18px;
        background: #071f27;
        border-bottom: 1px solid rgba(201, 161, 86, 0.35);
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.18);
      }

      .quote-actions-bar button {
        appearance: none;
        border: 1px solid #c9a156;
        background: transparent;
        color: #f7f1e8;
        padding: 12px 18px;
        font-family: inherit;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        cursor: pointer;
      }

      .quote-actions-bar button:first-child {
        background: #c9a156;
        color: #071f27;
      }

      body {
        padding-top: 72px;
      }

      @media print {
        .quote-actions-bar {
          display: none !important;
        }

        body {
          padding-top: 0 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
      }
    </style>

    <div class="quote-actions-bar">
      <button type="button" onclick="window.print()">Télécharger / imprimer le devis</button>
      <button type="button" onclick="window.close()">Fermer</button>
    </div>
  `;

  if (html.includes("quote-actions-bar")) return html;

  if (html.includes("<body")) {
    return html.replace(/<body([^>]*)>/i, `<body$1>${toolbar}`);
  }

  return toolbar + html;
}

function QuotesView({
  contacts,
  prefilledLead,
  quotes,
  activeActor,
  onChange,
  onQuoteChange
}: {
  contacts: Contact[];
  prefilledLead?: QuoteLeadDraft | null;
  quotes: QuoteRequest[];
  activeActor: string;
  onChange: (quotes: QuoteRequest[]) => void;
  onQuoteChange?: (quote: QuoteRequest) => void;
}) {
  function setQuotes(update: QuoteRequest[] | ((current: QuoteRequest[]) => QuoteRequest[])) {
    const nextQuotes = typeof update === "function" ? update(quotes) : update;

    onChange(nextQuotes);
    saveQuotesToBrowser(nextQuotes);
  }

  function updateQuoteStatus(id: string, status: QuoteStatus) {
    const currentQuote = quotes.find((quote) => quote.id === id);
    const updatedQuote = currentQuote
      ? stampUpdated({
          ...currentQuote,
          status,
          statusUpdatedAt: currentQuote.status === status
            ? currentQuote.statusUpdatedAt || currentQuote.createdAt
            : new Date().toISOString()
        }, activeActor) as QuoteRequest
      : null;

    setQuotes((current) =>
      current.map((quote) => (quote.id === id && updatedQuote ? updatedQuote : quote))
    );

    if (updatedQuote) {
      onQuoteChange?.(updatedQuote);
    }
  }

  const quoteCategories = ["Villa", "Bateau", "Voiture", "Conciergerie"];
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | "Tous">("Tous");

  // PREFILL_QUOTE_FROM_LEAD
  useEffect(() => {
    if (!prefilledLead) return;

    const foundForm = document.querySelector<HTMLFormElement>('form[data-quote-form="true"]');

    if (foundForm === null) {
      return;
    }

    const quoteForm: HTMLFormElement = foundForm;

    if (prefilledLead.quoteId) {
      const existingQuote = quotes.find((quote) => quote.id === prefilledLead.quoteId);

      if (existingQuote) {
        fillQuoteForm(existingQuote);
        return;
      }
    }

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

    setField("leadId", prefilledLead.leadId || "");
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

    setField("leadId", quote.leadId || "");
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
    const leadId = String(form.get("leadId") ?? "").trim();

    const quoteItems: QuoteLine[] = selectedCategories.map((category) => ({
      id: createQuoteId(),
      category,
      description: String(form.get(`description${category}`) ?? "").trim(),
      unitPrice: readQuoteNumber(form.get(`price${category}`)),
      billingUnit: getQuoteBillingUnit(form.get(`unit${category}`)),
      deposit: readQuoteNumber(form.get(`deposit${category}`))
    }));

    const unitPrice = quoteItems.reduce((sum, item) => sum + item.unitPrice, 0);
    const previousQuote = editingQuoteId ? quotes.find((item) => item.id === editingQuoteId) : undefined;

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

    const quotePayload: QuoteRequest = {
      ...(previousQuote ?? {}),
      id: editingQuoteId ?? createQuoteId(),
      leadId: leadId || undefined,
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
      statusUpdatedAt: previousQuote?.status === status
        ? previousQuote.statusUpdatedAt || previousQuote.createdAt
        : new Date().toISOString(),
      createdAt: editingQuoteId
        ? previousQuote?.createdAt ?? new Date().toISOString()
        : new Date().toISOString()
    };

    const quote: QuoteRequest = editingQuoteId
      ? stampUpdated(quotePayload, activeActor) as QuoteRequest
      : stampCreated(quotePayload, activeActor) as QuoteRequest;

    if (editingQuoteId) {
      setQuotes((current) => current.map((item) => (item.id === editingQuoteId ? quote : item)));
      setEditingQuoteId(null);
    } else {
      setQuotes((current) => [quote, ...current]);
    }

    onQuoteChange?.(quote);

    formElement.reset();
    window.setTimeout(() => {
      document.getElementById("quotes-list-panel")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 80);

  }

  const visibleQuotes =
    statusFilter === "Tous"
      ? quotes
      : quotes.filter((quote) => getQuoteStatus(quote.status) === statusFilter);


  return (
    <div className="two-columns wide-left">
      <section id="quotes-list-panel" className="card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Devis</p>
            <h3>{visibleQuotes.length} devis affiché{visibleQuotes.length > 1 ? "s" : ""}{statusFilter !== "Tous" ? ` · ${quotes.length} total` : ""}</h3>
          </div>
        </div>

        <div className="list-stack">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 22 }}>
          {(["Tous", ...quoteStatuses] as Array<QuoteStatus | "Tous">).map((status) => (
            <button
              key={status}
              type="button"
              className={statusFilter === status ? "primary-button" : "secondary-button"}
              onClick={() => setStatusFilter(status)}
            >
              {status === "Tous" ? "Tous" : getQuoteStatusFrenchLabel(status)}
            </button>
          ))}
        </div>

        {visibleQuotes.length === 0 ? (
            <p className="muted-line">Aucun devis pour le moment. Créez d’abord un contact et un lead, puis générez un devis depuis le lead.</p>
          ) : (
            visibleQuotes.map((quote) => (
              <article className="quote-card" key={quote.id} data-notification-target={`quote-${quote.id}`}>
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
                  <ActionMeta item={quote} />
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
          <input type="hidden" name="leadId" />
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




function SuppliersView({
  suppliers,
  onAdd,
  onUpdate,
  onDelete
}: {
  suppliers: Supplier[];
  onAdd: (supplier: Supplier) => void;
  onUpdate: (supplier: Supplier) => void;
  onDelete: (id: string) => void;
}) {
  const [categoryFilter, setCategoryFilter] = useState("Tous");
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  const categories = ["Tous", "Villa", "Voiture", "Bateau", "Chauffeur", "Chef", "Sécurité", "Conciergerie", "Paysagiste", "Gestion nuisibles", "Pisciniste", "Femme de ménage", "Nounou", "Artisan rénovation", "Lavage voiture", "Garage / mécanicien", "Jardinier", "Autre"];

  const visibleSuppliers =
    categoryFilter === "Tous"
      ? suppliers
      : suppliers.filter((supplier) => supplier.category === categoryFilter);

  function submitSupplier(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);

    const supplier: Supplier = {
      id: editingSupplier?.id ?? makeId("supplier"),
      name: String(form.get("name") ?? "").trim(),
      category: String(form.get("category") ?? "Autre") as Supplier["category"],
      contactName: String(form.get("contactName") ?? "").trim(),
      email: String(form.get("email") ?? "").trim(),
      phone: String(form.get("phone") ?? "").trim(),
      zone: String(form.get("zone") ?? "").trim(),
      quality: String(form.get("quality") ?? "Standard") as Supplier["quality"],
      reliability: String(form.get("reliability") ?? "À tester") as Supplier["reliability"],
      priceNotes: String(form.get("priceNotes") ?? "").trim(),
      commissionNotes: String(form.get("commissionNotes") ?? "").trim(),
      notes: String(form.get("notes") ?? "").trim(),
      status: String(form.get("status") ?? "Actif") as Supplier["status"],
      createdAt: editingSupplier?.createdAt ?? new Date().toISOString()
    };

    if (!supplier.name) {
      window.alert("Ajoutez au minimum le nom du fournisseur.");
      return;
    }

    if (editingSupplier) {
      onUpdate(supplier);
      setEditingSupplier(null);
    } else {
      onAdd(supplier);
    }

    event.currentTarget.reset();
  }

  return (
    <div className="split-layout">
      <section className="card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Réseau privé</p>
            <h3>{visibleSuppliers.length} fournisseur{visibleSuppliers.length > 1 ? "s" : ""}</h3>
          </div>
          <p className="muted-line">Partenaires et prestataires privés à activer rapidement.</p>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 22 }}>
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              className={categoryFilter === category ? "primary-button" : "secondary-button"}
              onClick={() => setCategoryFilter(category)}
            >
              {category}
            </button>
          ))}
        </div>

        {visibleSuppliers.length === 0 ? (
          <p className="muted-line">Aucun fournisseur dans cette catégorie.</p>
        ) : (
          <div className="list-stack">
            {visibleSuppliers.map((supplier) => (
              <article className="item-card" key={supplier.id}>
                <div>
                  <p className="eyebrow">{supplier.category} · {supplier.status}</p>
                  <h3>{supplier.name}</h3>
                  <p>{supplier.contactName || "Contact à compléter"}</p>
                  <p className="muted-line">{supplier.zone || "Zone non renseignée"}</p>
                  <p className="muted-line">
                    Qualité : {supplier.quality} · Fiabilité : {supplier.reliability}
                  </p>
                  {supplier.priceNotes && <p className="muted-line">Prix : {supplier.priceNotes}</p>}
                  {supplier.commissionNotes && <p className="muted-line">Commission : {supplier.commissionNotes}</p>}
                  {supplier.notes && <p>{supplier.notes}</p>}
                </div>

                <div className="item-actions">
                  {supplier.phone && (
                    <a className="secondary-button" href={`tel:${supplier.phone}`}>
                      Appeler
                    </a>
                  )}
                  {supplier.email && (
                    <a className="secondary-button" href={`mailto:${supplier.email}`}>
                      Email
                    </a>
                  )}
                  <button className="secondary-button" type="button" onClick={() => setEditingSupplier(supplier)}>
                    Modifier
                  </button>
                  <button
                    className="danger-button"
                    type="button"
                    onClick={() => {
                      if (window.confirm("Supprimer ce fournisseur ?")) {
                        onDelete(supplier.id);
                      }
                    }}
                  >
                    Supprimer
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <p className="eyebrow">{editingSupplier ? "Modification" : "Nouveau"}</p>
        <h3>{editingSupplier ? "Modifier le fournisseur" : "Ajouter un fournisseur"}</h3>

        <form className="form-grid" onSubmit={submitSupplier}>
          <label>Nom fournisseur
            <input name="name" defaultValue={editingSupplier?.name ?? ""} placeholder="Ex : Riviera Chauffeur Premium" />
          </label>

          <label>Catégorie
            <select name="category" defaultValue={editingSupplier?.category ?? "Autre"}>
              {categories.filter((category) => category !== "Tous").map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </label>

          <label>Contact
            <input name="contactName" defaultValue={editingSupplier?.contactName ?? ""} placeholder="Nom du contact" />
          </label>

          <label>Email
            <input name="email" type="email" defaultValue={editingSupplier?.email ?? ""} placeholder="email@exemple.com" />
          </label>

          <label>Téléphone
            <input name="phone" defaultValue={editingSupplier?.phone ?? ""} placeholder="+33..." />
          </label>

          <label>Zone
            <input name="zone" defaultValue={editingSupplier?.zone ?? ""} placeholder="Cannes, Monaco, Saint-Tropez..." />
          </label>

          <label>Qualité
            <select name="quality" defaultValue={editingSupplier?.quality ?? "Standard"}>
              <option>Standard</option>
              <option>Premium</option>
              <option>Très premium</option>
            </select>
          </label>

          <label>Fiabilité
            <select name="reliability" defaultValue={editingSupplier?.reliability ?? "À tester"}>
              <option>À tester</option>
              <option>Fiable</option>
              <option>Très fiable</option>
              <option>À éviter</option>
            </select>
          </label>

          <label>Notes prix
            <textarea name="priceNotes" defaultValue={editingSupplier?.priceNotes ?? ""} placeholder="Tarifs, minimum spend, conditions..." />
          </label>

          <label>Commission / marge
            <textarea name="commissionNotes" defaultValue={editingSupplier?.commissionNotes ?? ""} placeholder="Commission, marge, accord partenaire..." />
          </label>

          <label>Notes internes
            <textarea name="notes" defaultValue={editingSupplier?.notes ?? ""} placeholder="Réactivité, points forts, points faibles..." />
          </label>

          <label>Statut
            <select name="status" defaultValue={editingSupplier?.status ?? "Actif"}>
              <option>Actif</option>
              <option>À vérifier</option>
              <option>Inactif</option>
            </select>
          </label>

          <button className="primary-button" type="submit">
            {editingSupplier ? "Enregistrer" : "Ajouter fournisseur"}
          </button>

          {editingSupplier && (
            <button className="secondary-button" type="button" onClick={() => setEditingSupplier(null)}>
              Annuler modification
            </button>
          )}
        </form>
      </section>
    </div>
  );
}

function BookingsView({
  quotes,
  contacts = [],
  activeActor,
  onChange
}: {
  quotes: QuoteRequest[];
  contacts?: Contact[];
  activeActor: string;
  onChange: (quotes: QuoteRequest[]) => void;
}) {
  const confirmedQuotes = quotes.filter((quote) => getQuoteStatus(quote.status) === "Accepted");
  const providerContacts = contacts.filter(isSupplierContact);

  function getAssignedProvider(quote: QuoteRequest) {
    return providerContacts.find((contact) => contact.id === quote.assignedContactId);
  }

  function getPaymentRemaining(quote: QuoteRequest) {
    const total = getQuoteTotal(quote);
    const paid = Number(quote.depositReceived || 0) + Number(quote.balanceReceived || 0);

    return Math.max(total - paid, 0);
  }

  function getPaymentStatus(quote: QuoteRequest) {
    const total = getQuoteTotal(quote);
    const paid = Number(quote.depositReceived || 0) + Number(quote.balanceReceived || 0);

    if (quote.paymentStatus && quote.paymentStatus !== "Non payé") return quote.paymentStatus;
    if (total > 0 && paid >= total) return "Payé";
    if (Number(quote.depositReceived || 0) > 0) return "Acompte reçu";
    if (paid > 0) return "Partiel";

    return "Non payé";
  }

  function getMarginPercent(quote: QuoteRequest) {
    const total = getQuoteTotal(quote);
    const supplierCost = Number(quote.supplierCost || 0);

    if (total <= 0) return 0;

    return Math.round(((total - supplierCost) / total) * 100);
  }

  function updateBookingFinance(event: React.FormEvent<HTMLFormElement>, quote: QuoteRequest) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);

    const updatedQuote: QuoteRequest = stampUpdated({
      ...quote,
      supplierCost: readQuoteNumber(form.get("supplierCost")),
      depositReceived: readQuoteNumber(form.get("depositReceived")),
      balanceReceived: readQuoteNumber(form.get("balanceReceived")),
      paymentNotes: String(form.get("paymentNotes") ?? "").trim(),
      paymentStatus: String(form.get("paymentStatus") ?? "Non payé") as QuoteRequest["paymentStatus"],
      expectedDeposit: readQuoteNumber(form.get("expectedDeposit")),
      paymentDueDate: String(form.get("paymentDueDate") ?? ""),
      bookingStatus: String(form.get("bookingStatus") ?? "À préparer") as QuoteRequest["bookingStatus"],
      clientConfirmed: form.get("clientConfirmed") === "on",
      depositConfirmed: form.get("depositConfirmed") === "on",
      supplierConfirmed: form.get("supplierConfirmed") === "on",
      balanceConfirmed: form.get("balanceConfirmed") === "on",
      detailsSent: form.get("detailsSent") === "on",
      serviceCompleted: form.get("serviceCompleted") === "on",
      operationNotes: String(form.get("operationNotes") ?? "").trim(),
      assignedContactId: String(form.get("assignedContactId") ?? "")
    }, activeActor) as QuoteRequest;

    const nextQuotes = quotes.map((item) => (item.id === quote.id ? updatedQuote : item));

    onChange(nextQuotes);
    saveQuotesToBrowser(nextQuotes);
    window.alert("Réservation enregistrée.");
  }

  return (
    <section className="card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Services confirmés</p>
          <h3>{confirmedQuotes.length} réservation{confirmedQuotes.length > 1 ? "s" : ""}</h3>
        </div>
        <p className="muted-line">
          Suivez ici les devis gagnés, la marge estimée, les paiements reçus et la préparation opérationnelle.
        </p>
      </div>

      {confirmedQuotes.length === 0 ? (
        <p className="muted-line">Aucune réservation confirmée pour le moment.</p>
      ) : (
        <div className="list-stack">
          {confirmedQuotes.map((quote) => {
            const services = getQuoteItems(quote)
              .map((item) => getQuoteCategoryFrenchLabel(item.category))
              .join(" · ");

            const clientPrice = getQuoteTotal(quote);
            const supplierCost = Number(quote.supplierCost || 0);
            const depositReceived = Number(quote.depositReceived || 0);
            const balanceReceived = Number(quote.balanceReceived || 0);
            const margin = clientPrice - supplierCost;
            const remainingBalance = Math.max(clientPrice - depositReceived - balanceReceived, 0);
            const paymentStatus = getPaymentStatus(quote);
            const marginPercent = getMarginPercent(quote);
            const assignedProvider = getAssignedProvider(quote);

            return (
              <article className="item-card" key={quote.id} data-notification-target={`booking-${quote.id}`}>
                <div>
                  <p className="eyebrow">{services || "Service confirmé"}</p>
                  <h3>{quote.clientName}</h3>
                  <p>{quote.title || "Réservation confirmée"}</p>
                  <p className="muted-line">
                    Du {formatQuoteDate(quote.startDate)} au {formatQuoteDate(quote.endDate)}
                  </p>

                  <div className="stats-grid" style={{ marginTop: 18 }}>
                    <div className="mini-stat">
                      <span>Prix client</span>
                      <strong>{formatQuotePrice(clientPrice)}</strong>
                    </div>
                    <div className="mini-stat">
                      <span>Coût fournisseur</span>
                      <strong>{formatQuotePrice(supplierCost)}</strong>
                    </div>
                    <div className="mini-stat">
                      <span>Marge estimée</span>
                      <strong>{formatQuotePrice(margin)}</strong>
                    </div>
                    <div className="mini-stat">
                      <span>Solde restant</span>
                      <strong>{formatQuotePrice(remainingBalance)}</strong>
                    </div>
                    <div className="mini-stat">
                      <span>Statut paiement</span>
                      <strong>{paymentStatus}</strong>
                    </div>
                    <div className="mini-stat">
                      <span>Acompte attendu</span>
                      <strong>{formatQuotePrice(Number(quote.expectedDeposit || 0))}</strong>
                    </div>
                    <div className="mini-stat">
                      <span>Marge %</span>
                      <strong>{marginPercent}%</strong>
                    </div>
                    <div className="mini-stat">
                      <span>Limite paiement</span>
                      <strong>{quote.paymentDueDate ? formatQuoteDate(quote.paymentDueDate) : "—"}</strong>
                    </div>
                  </div>

                  {assignedProvider && (
                    <div className="asset-detail-grid" style={{ marginTop: 18 }}>
                      <div>
                        <span>Prestataire affecté</span>
                        <strong>{assignedProvider.name}</strong>
                      </div>
                      <div>
                        <span>Service</span>
                        <strong>{getContactSupplierCategory(assignedProvider)}</strong>
                      </div>
                      <div>
                        <span>Téléphone</span>
                        <strong>{assignedProvider.phone || "—"}</strong>
                      </div>
                      <div>
                        <span>Email</span>
                        <strong>{assignedProvider.email || "—"}</strong>
                      </div>
                    </div>
                  )}

                  <form className="form-grid" onSubmit={(event) => updateBookingFinance(event, quote)} style={{ marginTop: 20 }}>
                    <label>Statut paiement
                      <select name="paymentStatus" defaultValue={quote.paymentStatus || getPaymentStatus(quote)}>
                        <option>Non payé</option>
                        <option>Acompte reçu</option>
                        <option>Partiel</option>
                        <option>Payé</option>
                        <option>Annulé / remboursé</option>
                      </select>
                    </label>

                    <label>Acompte attendu
                      <input name="expectedDeposit" type="number" min="0" step="1" defaultValue={quote.expectedDeposit || ""} placeholder="Ex : 1000" />
                    </label>

                    <label>Date limite paiement
                      <input name="paymentDueDate" type="date" defaultValue={quote.paymentDueDate || ""} />
                    </label>

                    <label>Coût fournisseur
                      <input name="supplierCost" type="number" min="0" step="1" defaultValue={quote.supplierCost || ""} placeholder="Ex : 2500" />
                    </label>

                    <label>Acompte reçu
                      <input name="depositReceived" type="number" min="0" step="1" defaultValue={quote.depositReceived || ""} placeholder="Ex : 1000" />
                    </label>

                    <label>Solde reçu
                      <input name="balanceReceived" type="number" min="0" step="1" defaultValue={quote.balanceReceived || ""} placeholder="Ex : 3000" />
                    </label>

                    <label>Notes paiement
                      <textarea name="paymentNotes" defaultValue={quote.paymentNotes || ""} placeholder="Ex : acompte reçu par virement, solde attendu avant arrivée" />
                    </label>

                    <label>Prestataire affecté
                      <select name="assignedContactId" defaultValue={quote.assignedContactId || ""}>
                        <option value="">Non affecté</option>
                        {providerContacts.map((contact) => (
                          <option key={contact.id} value={contact.id}>
                            {contact.name} · {getContactSupplierCategory(contact)}{getContactSupplierZone(contact) ? ` · ${getContactSupplierZone(contact)}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>Statut opérationnel
                      <select name="bookingStatus" defaultValue={quote.bookingStatus || "À préparer"}>
                        <option>À préparer</option>
                        <option>Prestataire à confirmer</option>
                        <option>Confirmé</option>
                        <option>En cours</option>
                        <option>Terminé</option>
                        <option>Annulé</option>
                      </select>
                    </label>

                    <div className="card" style={{ boxShadow: "none", padding: 16 }}>
                      <p className="eyebrow">Checklist opérationnelle</p>

                      <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <input name="clientConfirmed" type="checkbox" defaultChecked={Boolean(quote.clientConfirmed)} />
                        Client confirmé
                      </label>

                      <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <input name="depositConfirmed" type="checkbox" defaultChecked={Boolean(quote.depositConfirmed)} />
                        Acompte reçu
                      </label>

                      <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <input name="supplierConfirmed" type="checkbox" defaultChecked={Boolean(quote.supplierConfirmed)} />
                        Prestataire confirmé
                      </label>

                      <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <input name="balanceConfirmed" type="checkbox" defaultChecked={Boolean(quote.balanceConfirmed)} />
                        Solde reçu
                      </label>

                      <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <input name="detailsSent" type="checkbox" defaultChecked={Boolean(quote.detailsSent)} />
                        Détails envoyés au client
                      </label>

                      <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <input name="serviceCompleted" type="checkbox" defaultChecked={Boolean(quote.serviceCompleted)} />
                        Service terminé
                      </label>
                    </div>

                    <label>Notes opérationnelles
                      <textarea name="operationNotes" defaultValue={quote.operationNotes || ""} placeholder="Horaires, adresse, contact sur place, contraintes, préférences client..." />
                    </label>

                    <button className="primary-button" type="submit">
                      Enregistrer réservation
                    </button>
                  </form>
                </div>

                <div className="item-actions">
                  <span className="status-pill">{quote.bookingStatus || "À préparer"}</span>
                  <button className="secondary-button" type="button" onClick={() => openQuotePdf(quote)}>
                    Ouvrir devis
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}



function HouseTrackingView({
  contacts,
  houses,
  workers,
  timeEntries,
  payments,
  onAddHouse,
  onDeleteHouse,
  onAddWorker,
  onDeleteWorker,
  onAddTimeEntry,
  onDeleteTimeEntry,
  onAddPayment,
  onDeletePayment
}: {
  contacts: Contact[];
  houses: HouseTrackingHouse[];
  workers: HouseTrackingWorker[];
  timeEntries: HouseTimeEntry[];
  payments: HousePayment[];
  onAddHouse: (house: HouseTrackingHouse) => void;
  onDeleteHouse: (id: string) => void;
  onAddWorker: (worker: HouseTrackingWorker) => void;
  onDeleteWorker: (id: string) => void;
  onAddTimeEntry: (entry: HouseTimeEntry) => void;
  onDeleteTimeEntry: (id: string) => void;
  onAddPayment: (payment: HousePayment) => void;
  onDeletePayment: (id: string) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [monthFilter, setMonthFilter] = useState(getCurrentMonthValue());
  const [houseFilter, setHouseFilter] = useState("Tous");
  const [workerFilter, setWorkerFilter] = useState("Tous");
  const [hourDraft, setHourDraft] = useState({
    date: today,
    houseId: houses[0]?.id || "",
    workerId: workers[0]?.id || "",
    startTime: "09:00",
    endTime: "13:00",
    breakMinutes: "0",
    hourlyRate: workers[0]?.hourlyRate ? String(workers[0].hourlyRate) : "",
    note: ""
  });

  const filteredEntries = timeEntries.filter((entry) => {
    const matchesMonth = !monthFilter || getMonthFromDate(entry.date) === monthFilter;
    const matchesHouse = houseFilter === "Tous" || entry.houseId === houseFilter;
    const matchesWorker = workerFilter === "Tous" || entry.workerId === workerFilter;
    return matchesMonth && matchesHouse && matchesWorker;
  });

  const filteredPayments = payments.filter((payment) => {
    const matchesMonth = !monthFilter || getMonthFromDate(payment.date) === monthFilter;
    const matchesHouse = houseFilter === "Tous" || payment.houseId === houseFilter;
    const matchesWorker = workerFilter === "Tous" || payment.workerId === workerFilter;
    return matchesMonth && matchesHouse && matchesWorker;
  });

  const totalHours = filteredEntries.reduce((sum, entry) => sum + getHouseTimeHours(entry), 0);
  const totalDue = filteredEntries.reduce((sum, entry) => sum + getHouseTimeAmount(entry), 0);
  const totalPaid = filteredPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const totalBalance = Math.max(totalDue - totalPaid, 0);

  const selectedWorker = workers.find((worker) => worker.id === hourDraft.workerId);
  const currentRate = Number(hourDraft.hourlyRate || selectedWorker?.hourlyRate || 0);
  const previewEntry = {
    startTime: hourDraft.startTime,
    endTime: hourDraft.endTime,
    breakMinutes: Number(hourDraft.breakMinutes || 0),
    hourlyRate: currentRate
  };
  const previewHours = getHouseTimeHours(previewEntry);
  const previewAmount = getHouseTimeAmount(previewEntry);

  const balanceRows = workers
    .map((worker) => {
      const workerEntries = filteredEntries.filter((entry) => entry.workerId === worker.id);
      const workerPayments = filteredPayments.filter((payment) => payment.workerId === worker.id);
      const hours = workerEntries.reduce((sum, entry) => sum + getHouseTimeHours(entry), 0);
      const due = workerEntries.reduce((sum, entry) => sum + getHouseTimeAmount(entry), 0);
      const paid = workerPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

      return {
        worker,
        hours,
        due,
        paid,
        balance: Math.max(due - paid, 0)
      };
    })
    .filter((row) => row.hours > 0 || row.paid > 0 || row.balance > 0);

  function submitHouse(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();

    if (!name) return window.alert("Ajoutez le nom de la maison.");

    onAddHouse({
      id: makeId("house"),
      name,
      address: String(form.get("address") ?? "").trim(),
      notes: String(form.get("notes") ?? "").trim(),
      createdAt: new Date().toISOString()
    });

    event.currentTarget.reset();
  }

  function submitWorker(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const contactId = String(form.get("contactId") ?? "");
    const contact = contacts.find((item) => item.id === contactId);
    const contactName = contact?.name || String(form.get("contactName") ?? "").trim();

    if (!contactName) return window.alert("Choisissez ou créez un contact intervenant.");

    onAddWorker({
      id: makeId("worker"),
      contactId,
      contactName,
      role: String(form.get("role") ?? "Intervenant").trim() || "Intervenant",
      hourlyRate: safeNumber(form.get("hourlyRate")),
      status: "Actif",
      notes: String(form.get("notes") ?? "").trim(),
      createdAt: new Date().toISOString()
    });

    event.currentTarget.reset();
  }

  function submitTimeEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const house = houses.find((item) => item.id === hourDraft.houseId);
    const worker = workers.find((item) => item.id === hourDraft.workerId);

    if (!house) return window.alert("Choisissez une maison.");
    if (!worker) return window.alert("Choisissez un intervenant.");
    if (previewHours <= 0) return window.alert("Vérifiez les heures de début et de fin.");

    onAddTimeEntry({
      id: makeId("hours"),
      houseId: house.id,
      houseName: house.name,
      workerId: worker.id,
      workerName: worker.contactName,
      date: hourDraft.date,
      startTime: hourDraft.startTime,
      endTime: hourDraft.endTime,
      breakMinutes: Number(hourDraft.breakMinutes || 0),
      hourlyRate: currentRate,
      note: hourDraft.note.trim(),
      createdAt: new Date().toISOString()
    });

    setHourDraft((current) => ({ ...current, note: "" }));
  }

  function submitPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const house = houses.find((item) => item.id === String(form.get("houseId") ?? ""));
    const worker = workers.find((item) => item.id === String(form.get("workerId") ?? ""));
    const amount = safeNumber(form.get("amount"));

    if (!house) return window.alert("Choisissez une maison.");
    if (!worker) return window.alert("Choisissez un intervenant.");
    if (amount <= 0) return window.alert("Ajoutez un montant payé.");

    onAddPayment({
      id: makeId("payment"),
      houseId: house.id,
      houseName: house.name,
      workerId: worker.id,
      workerName: worker.contactName,
      date: String(form.get("date") ?? today),
      amount,
      method: String(form.get("method") ?? "Virement") as HousePayment["method"],
      note: String(form.get("note") ?? "").trim(),
      createdAt: new Date().toISOString()
    });

    event.currentTarget.reset();
  }

  function exportHouseCsv() {
    const rows = [
      ["Type", "Date", "Maison", "Intervenant", "Role", "Debut", "Fin", "Pause", "Heures", "Taux", "Du", "Paye", "Moyen", "Note"],
      ...filteredEntries.map((entry) => {
        const worker = workers.find((item) => item.id === entry.workerId);
        return [
          "Heures",
          entry.date,
          entry.houseName,
          entry.workerName,
          worker?.role || "",
          entry.startTime,
          entry.endTime,
          String(entry.breakMinutes),
          String(getHouseTimeHours(entry)),
          String(entry.hourlyRate),
          String(getHouseTimeAmount(entry)),
          "",
          "",
          entry.note || ""
        ];
      }),
      ...filteredPayments.map((payment) => {
        const worker = workers.find((item) => item.id === payment.workerId);
        return [
          "Paiement",
          payment.date,
          payment.houseName,
          payment.workerName,
          worker?.role || "",
          "",
          "",
          "",
          "",
          "",
          "",
          String(payment.amount),
          payment.method,
          payment.note || ""
        ];
      })
    ];

    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `suivi-maison-${monthFilter || "toutes-dates"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="stack house-tracking-view">
      <section className="card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Gestion privée maison</p>
            <h3>Suivi des heures, salaires et paiements</h3>
          </div>
          <button className="secondary-button" type="button" onClick={exportHouseCsv}>Export CSV</button>
        </div>

        <div className="stats-grid">
          <StatCard label="Heures travaillées" value={formatHours(totalHours)} caption="Période filtrée" />
          <StatCard label="Salaire dû" value={currency.format(totalDue)} caption="Heures x taux" />
          <StatCard label="Déjà payé" value={currency.format(totalPaid)} caption="Paiements saisis" />
          <StatCard label="Solde restant" value={currency.format(totalBalance)} caption="À payer" />
        </div>

        <div className="form-grid" style={{ marginTop: 18 }}>
          <label>Mois
            <input type="month" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} />
          </label>

          <label>Maison
            <select value={houseFilter} onChange={(event) => setHouseFilter(event.target.value)}>
              <option value="Tous">Toutes les maisons</option>
              {houses.map((house) => <option key={house.id} value={house.id}>{house.name}</option>)}
            </select>
          </label>

          <label>Intervenant
            <select value={workerFilter} onChange={(event) => setWorkerFilter(event.target.value)}>
              <option value="Tous">Tous les intervenants</option>
              {workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.contactName}</option>)}
            </select>
          </label>
        </div>
      </section>

      <div className="house-tracking-grid">
        <aside className="stack">
          <section className="card">
            <p className="eyebrow">Maisons</p>
            <h3>Maisons</h3>
            <form className="form-grid" onSubmit={submitHouse}>
              <label>Nom
                <input name="name" placeholder="Maison principale" />
              </label>
              <label>Adresse
                <input name="address" placeholder="Adresse" />
              </label>
              <label>Notes
                <textarea name="notes" placeholder="Accès, alarmes, consignes..." />
              </label>
              <button className="primary-button" type="submit">Ajouter la maison</button>
            </form>

            <div className="list-stack" style={{ marginTop: 18 }}>
              {houses.length === 0 ? <p className="muted-line">Aucune maison.</p> : houses.map((house) => (
                <article className="mini-row" key={house.id}>
                  <div>
                    <strong>{house.name}</strong>
                    <span>{house.address || "Adresse à compléter"}</span>
                  </div>
                  <button className="danger-link" type="button" onClick={() => window.confirm("Supprimer cette maison ?") && onDeleteHouse(house.id)}>Suppr.</button>
                </article>
              ))}
            </div>
          </section>

          <section className="card">
            <p className="eyebrow">Intervenants</p>
            <h3>Intervenants</h3>
            <form className="form-grid" onSubmit={submitWorker}>
              <label>Contact CRM
                <select name="contactId" defaultValue="">
                  <option value="">Choisir un contact</option>
                  {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name} · {contact.kind}</option>)}
                </select>
              </label>
              <label>Nom manuel si besoin
                <input name="contactName" placeholder="Nom" />
              </label>
              <label>Rôle
                <input name="role" placeholder="Ménage, nounou, chauffeur..." />
              </label>
              <label>Taux horaire
                <input name="hourlyRate" type="number" min="0" step="0.5" placeholder="Ex : 18" />
              </label>
              <label>Notes
                <textarea name="notes" placeholder="Disponibilités, conditions, préférences..." />
              </label>
              <button className="primary-button" type="submit">Ajouter l’intervenant</button>
            </form>

            <div className="list-stack" style={{ marginTop: 18 }}>
              {workers.length === 0 ? <p className="muted-line">Aucun intervenant.</p> : workers.map((worker) => (
                <article className="mini-row" key={worker.id} data-notification-target={`house-worker-${worker.id}`}>
                  <div>
                    <strong>{worker.contactName}</strong>
                    <span>{worker.role} · {currency.format(worker.hourlyRate)}/h</span>
                  </div>
                  <button className="danger-link" type="button" onClick={() => window.confirm("Supprimer cet intervenant ?") && onDeleteWorker(worker.id)}>Suppr.</button>
                </article>
              ))}
            </div>
          </section>
        </aside>

        <main className="stack">
          <section className="card">
            <p className="eyebrow">Saisie</p>
            <h3>Saisie des heures</h3>
            <form className="form-grid" onSubmit={submitTimeEntry}>
              <label>Date
                <input type="date" value={hourDraft.date} onChange={(event) => setHourDraft((current) => ({ ...current, date: event.target.value }))} />
              </label>
              <label>Maison
                <select value={hourDraft.houseId} onChange={(event) => setHourDraft((current) => ({ ...current, houseId: event.target.value }))}>
                  <option value="">Choisir</option>
                  {houses.map((house) => <option key={house.id} value={house.id}>{house.name}</option>)}
                </select>
              </label>
              <label>Intervenant
                <select value={hourDraft.workerId} onChange={(event) => {
                  const worker = workers.find((item) => item.id === event.target.value);
                  setHourDraft((current) => ({ ...current, workerId: event.target.value, hourlyRate: worker?.hourlyRate ? String(worker.hourlyRate) : current.hourlyRate }));
                }}>
                  <option value="">Choisir</option>
                  {workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.contactName}</option>)}
                </select>
              </label>
              <label>Début
                <input type="time" value={hourDraft.startTime} onChange={(event) => setHourDraft((current) => ({ ...current, startTime: event.target.value }))} />
              </label>
              <label>Fin
                <input type="time" value={hourDraft.endTime} onChange={(event) => setHourDraft((current) => ({ ...current, endTime: event.target.value }))} />
              </label>
              <label>Pause minutes
                <input type="number" min="0" value={hourDraft.breakMinutes} onChange={(event) => setHourDraft((current) => ({ ...current, breakMinutes: event.target.value }))} />
              </label>
              <label>Taux horaire
                <input type="number" min="0" step="0.5" value={hourDraft.hourlyRate} onChange={(event) => setHourDraft((current) => ({ ...current, hourlyRate: event.target.value }))} />
              </label>
              <label>Note
                <input value={hourDraft.note} onChange={(event) => setHourDraft((current) => ({ ...current, note: event.target.value }))} placeholder="Ex : ménage complet, soirée enfants..." />
              </label>
              <div className="full muted-line" style={{ padding: 14, background: "rgba(7,31,39,0.04)" }}>
                Calcul immédiat : <strong>{formatHours(previewHours)}</strong> — <strong>{currency.format(previewAmount)}</strong>
              </div>
              <button className="primary-button" type="submit">Ajouter les heures</button>
            </form>
          </section>

          <section className="card">
            <p className="eyebrow">Paiements</p>
            <h3>Saisie des paiements</h3>
            <form className="form-grid" onSubmit={submitPayment}>
              <label>Date
                <input name="date" type="date" defaultValue={today} />
              </label>
              <label>Maison
                <select name="houseId" defaultValue={houses[0]?.id || ""}>
                  <option value="">Choisir</option>
                  {houses.map((house) => <option key={house.id} value={house.id}>{house.name}</option>)}
                </select>
              </label>
              <label>Intervenant
                <select name="workerId" defaultValue={workers[0]?.id || ""}>
                  <option value="">Choisir</option>
                  {workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.contactName}</option>)}
                </select>
              </label>
              <label>Montant
                <input name="amount" type="number" min="0" step="1" placeholder="Ex : 150" />
              </label>
              <label>Moyen
                <select name="method" defaultValue="Virement">
                  <option>Virement</option>
                  <option>Espèces</option>
                  <option>CB</option>
                  <option>Chèque</option>
                  <option>Autre</option>
                </select>
              </label>
              <label>Note
                <input name="note" placeholder="Paiement semaine..." />
              </label>
              <button className="primary-button" type="submit">Ajouter le paiement</button>
            </form>
          </section>

          <section className="card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Soldes</p>
                <h3>Soldes par intervenant</h3>
              </div>
            </div>
            {balanceRows.length === 0 ? (
              <p className="muted-line">Aucun solde sur la période.</p>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Intervenant</th>
                      <th>Heures</th>
                      <th>Dû</th>
                      <th>Payé</th>
                      <th>Solde</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balanceRows.map((row) => (
                      <tr key={row.worker.id}>
                        <td><strong>{row.worker.contactName}</strong><br /><span className="muted-line">{row.worker.role}</span></td>
                        <td>{formatHours(row.hours)}</td>
                        <td>{currency.format(row.due)}</td>
                        <td>{currency.format(row.paid)}</td>
                        <td><strong>{currency.format(row.balance)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card">
            <p className="eyebrow">Historique</p>
            <h3>Historique des heures</h3>
            <div className="list-stack">
              {filteredEntries.length === 0 ? <p className="muted-line">Aucune heure saisie.</p> : filteredEntries.map((entry) => (
                <article className="mini-row" key={entry.id}>
                  <div>
                    <strong>{entry.workerName}</strong>
                    <span>{entry.date} · {entry.houseName} · {entry.startTime} à {entry.endTime} · {formatHours(getHouseTimeHours(entry))} · {currency.format(getHouseTimeAmount(entry))}</span>
                  </div>
                  <button className="danger-link" type="button" onClick={() => window.confirm("Supprimer ces heures ?") && onDeleteTimeEntry(entry.id)}>Suppr.</button>
                </article>
              ))}
            </div>
          </section>

          <section className="card">
            <p className="eyebrow">Historique</p>
            <h3>Historique des paiements</h3>
            <div className="list-stack">
              {filteredPayments.length === 0 ? <p className="muted-line">Aucun paiement saisi.</p> : filteredPayments.map((payment) => (
                <article className="mini-row" key={payment.id}>
                  <div>
                    <strong>{payment.workerName}</strong>
                    <span>{payment.date} · {payment.houseName} · {currency.format(payment.amount)} · {payment.method}</span>
                  </div>
                  <button className="danger-link" type="button" onClick={() => window.confirm("Supprimer ce paiement ?") && onDeletePayment(payment.id)}>Suppr.</button>
                </article>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function VendorInvoicesView({
  contacts,
  invoices,
  onAdd,
  onUpdate,
  onDelete
}: {
  contacts: Contact[];
  invoices: VendorInvoice[];
  onAdd: (invoice: VendorInvoice) => void;
  onUpdate: (invoice: VendorInvoice) => void;
  onDelete: (id: string) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<VendorInvoice["status"] | "Tous">("Tous");
  const [editingInvoice, setEditingInvoice] = useState<VendorInvoice | null>(null);

  const supplierContacts = contacts.filter((contact) => {
    const kind = String((contact as any).kind || "");
    return kind === "Fournisseur" || kind === "Partenaire" || kind === "Propriétaire";
  });

  const selectableContacts = supplierContacts.length > 0 ? supplierContacts : contacts;

  const visibleInvoices = statusFilter === "Tous"
    ? invoices
    : invoices.filter((invoice) => invoice.status === statusFilter);

  const totalToPay = invoices
    .filter((invoice) => invoice.status !== "Payé" && invoice.status !== "Annulé")
    .reduce((sum, invoice) => sum + getVendorInvoiceRemaining(invoice), 0);

  function submitInvoice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const contactId = String(form.get("contactId") ?? "");
    const contact = contacts.find((item) => item.id === contactId);
    const amount = safeNumber(form.get("amount"));
    const paidAmount = safeNumber(form.get("paidAmount"));
    const dueDate = String(form.get("dueDate") ?? "");

    const invoice: VendorInvoice = {
      id: editingInvoice?.id || makeId("invoice"),
      contactId,
      contactName: contact?.name || String(form.get("contactName") ?? "").trim(),
      category: String(form.get("category") ?? "Fournisseur").trim(),
      title: String(form.get("title") ?? "").trim() || "Facture fournisseur",
      invoiceDate: String(form.get("invoiceDate") ?? ""),
      dueDate,
      amount,
      paidAmount,
      status: getVendorInvoiceStatus(amount, paidAmount, dueDate),
      paymentMethod: String(form.get("paymentMethod") ?? "").trim(),
      notes: String(form.get("notes") ?? "").trim(),
      createdAt: editingInvoice?.createdAt || new Date().toISOString()
    };

    if (!invoice.contactName) return window.alert("Choisissez un contact fournisseur.");
    if (!invoice.amount || invoice.amount <= 0) return window.alert("Ajoutez un montant de facture.");

    if (editingInvoice) {
      onUpdate(invoice);
      setEditingInvoice(null);
    } else {
      onAdd(invoice);
    }

    event.currentTarget.reset();
  }

  return (
    <div className="two-columns wide-left">
      <section className="card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Factures fournisseurs</p>
            <h3>{visibleInvoices.length} facture{visibleInvoices.length > 1 ? "s" : ""}</h3>
          </div>
          <div>
            <p className="eyebrow">Reste à payer</p>
            <h3>{currency.format(totalToPay)}</h3>
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
          {(["Tous", "À payer", "Partiellement payé", "En retard", "Payé", "Annulé"] as Array<VendorInvoice["status"] | "Tous">).map((status) => (
            <button
              key={status}
              type="button"
              className={statusFilter === status ? "primary-button" : "secondary-button"}
              onClick={() => setStatusFilter(status)}
            >
              {status}
            </button>
          ))}
        </div>

        {visibleInvoices.length === 0 ? (
          <p className="muted-line">Aucune facture fournisseur pour ce filtre.</p>
        ) : (
          <div className="list-stack">
            {visibleInvoices.map((invoice) => (
              <article className="item-card" key={invoice.id}>
                <div>
                  <p className="eyebrow">{invoice.category} · {invoice.status}</p>
                  <h3>{invoice.contactName}</h3>
                  <p>{invoice.title}</p>
                  <p className="muted-line">
                    Facture : {invoice.invoiceDate || "À compléter"} · Échéance : {invoice.dueDate || "À compléter"}
                  </p>

                  <div className="stats-grid" style={{ marginTop: 14 }}>
                    <div className="mini-stat">
                      <span>Montant</span>
                      <strong>{currency.format(invoice.amount)}</strong>
                    </div>
                    <div className="mini-stat">
                      <span>Payé</span>
                      <strong>{currency.format(invoice.paidAmount)}</strong>
                    </div>
                    <div className="mini-stat">
                      <span>Reste</span>
                      <strong>{currency.format(getVendorInvoiceRemaining(invoice))}</strong>
                    </div>
                  </div>
                </div>

                <div className="item-actions">
                  <span className="status-pill">{invoice.status}</span>
                  <button className="secondary-button" type="button" onClick={() => setEditingInvoice(invoice)}>
                    Modifier
                  </button>
                  <button
                    className="danger-link"
                    type="button"
                    onClick={() => {
                      if (window.confirm("Supprimer cette facture fournisseur ?")) {
                        onDelete(invoice.id);
                      }
                    }}
                  >
                    Supprimer
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card form-card">
        <p className="eyebrow">{editingInvoice ? "Modification" : "Nouvelle"}</p>
        <h3>{editingInvoice ? "Modifier facture" : "Ajouter une facture fournisseur"}</h3>

        <form className="form-grid" onSubmit={submitInvoice}>
          <label>Contact fournisseur
            <select name="contactId" defaultValue={editingInvoice?.contactId || ""} required>
              <option value="">Choisir un contact</option>
              {selectableContacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name} · {String((contact as any).kind || "Contact")}
                </option>
              ))}
            </select>
          </label>

          <label>Catégorie
            <select name="category" defaultValue={editingInvoice?.category || "Fournisseur"}>
              <option>Fournisseur</option>
              <option>Paysagiste</option>
              <option>Jardinier</option>
              <option>Pisciniste</option>
              <option>Femme de ménage</option>
              <option>Nounou</option>
              <option>Garage / mécanicien</option>
              <option>Lavage voiture</option>
              <option>Artisan rénovation</option>
              <option>Gestion nuisibles</option>
              <option>Autre</option>
            </select>
          </label>

          <label>Objet facture
            <input name="title" defaultValue={editingInvoice?.title || ""} placeholder="Ex : Entretien jardin juin" />
          </label>

          <label>Date facture
            <input name="invoiceDate" type="date" defaultValue={editingInvoice?.invoiceDate || ""} />
          </label>

          <label>Échéance paiement
            <input name="dueDate" type="date" defaultValue={editingInvoice?.dueDate || ""} />
          </label>

          <label>Montant facture
            <input name="amount" type="number" min="0" step="1" defaultValue={editingInvoice?.amount || ""} placeholder="Ex : 450" required />
          </label>

          <label>Montant payé
            <input name="paidAmount" type="number" min="0" step="1" defaultValue={editingInvoice?.paidAmount || ""} placeholder="Ex : 0" />
          </label>

          <label>Moyen de paiement
            <input name="paymentMethod" defaultValue={editingInvoice?.paymentMethod || ""} placeholder="Virement, espèces, CB..." />
          </label>

          <label>Notes
            <textarea name="notes" defaultValue={editingInvoice?.notes || ""} placeholder="Détails, facture reçue, IBAN, remarque..." />
          </label>

          <button className="primary-button" type="submit">
            {editingInvoice ? "Enregistrer" : "Ajouter facture"}
          </button>

          {editingInvoice && (
            <button className="secondary-button" type="button" onClick={() => setEditingInvoice(null)}>
              Annuler
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
  const [sharedWorkspaceReady, setSharedWorkspaceReady] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [activeActor, setActiveActor] = useState<CRMActor>("Matteo");

  useEffect(() => {
    const savedActor = window.localStorage.getItem(ACTOR_STORAGE_KEY);

    if (isCRMActor(savedActor)) {
      setActiveActor(savedActor);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(ACTOR_STORAGE_KEY, activeActor);
  }, [activeActor]);

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
        setData(normalizeSharedCRMData(parsed));
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


  useEffect(() => {
    let cancelled = false;

    async function loadSharedWorkspaceState() {
      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (cancelled) return;

      if (userError || !userData.user) {
        window.alert("Base CRM partagée non chargée : utilisateur Supabase non connecté.");
        setSharedWorkspaceReady(false);
        return;
      }

      const { data: row, error } = await supabase
        .from("crm_workspace_state")
        .select("payload")
        .eq("workspace_id", SHARED_WORKSPACE_ID)
        .single();

      if (cancelled) return;

      if (error) {
        window.alert(`Base CRM partagée non chargée : ${error.message}`);
        setSharedWorkspaceReady(false);
        return;
      }

      const sharedData = normalizeSharedCRMData(row?.payload);

      if (crmDataHasContent(sharedData)) {
        setData(sharedData);
        setSharedWorkspaceReady(true);
        return;
      }

      const localData = readLocalCRMDataSafely();

      if (!crmDataHasContent(localData)) {
        setData(emptyData);
        setSharedWorkspaceReady(true);
        return;
      }

      const shouldSeedSharedWorkspace = window.confirm(
        "La base CRM partagée est vide.\n\nCopier CETTE version locale dans la base commune pour toi et Vincent ?\n\nClique OK uniquement si les données visibles dans TON CRM sont les bonnes. Si tu vois une démo, clique Annuler."
      );

      if (!shouldSeedSharedWorkspace) {
        setData(emptyData);
        setSharedWorkspaceReady(true);
        return;
      }

      const { error: seedError } = await supabase
        .from("crm_workspace_state")
        .upsert({
          workspace_id: SHARED_WORKSPACE_ID,
          payload: localData,
          updated_at: new Date().toISOString(),
          updated_by: userData.user.id
        }, { onConflict: "workspace_id" });

      if (seedError) {
        window.alert(`Base CRM partagée non initialisée : ${seedError.message}`);
        setSharedWorkspaceReady(false);
        return;
      }

      setData(localData);
      setSharedWorkspaceReady(true);
    }

    const timer = window.setTimeout(() => {
      void loadSharedWorkspaceState();
    }, 700);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!sharedWorkspaceReady) return;

    const timer = window.setTimeout(() => {
      async function saveSharedWorkspaceState() {
        const { data: userData, error: userError } = await supabase.auth.getUser();

        if (userError || !userData.user) return;

        const visibleQuotes = mergeQuoteRequests((((data as any).quotes ?? []) as QuoteRequest[]), loadSavedQuotes());
        const dataWithVisibleQuotes: CRMData = {
          ...data,
          quotes: visibleQuotes
        };

        const { error } = await supabase
          .from("crm_workspace_state")
          .upsert({
            workspace_id: SHARED_WORKSPACE_ID,
            payload: dataWithVisibleQuotes,
            updated_at: new Date().toISOString(),
            updated_by: userData.user.id
          }, { onConflict: "workspace_id" });

        if (error) {
          console.warn(`Base CRM partagée non sauvegardée : ${error.message}`);
        }
      }

      void saveSharedWorkspaceState();
    }, 900);

    return () => {
      window.clearTimeout(timer);
    };
  }, [data, sharedWorkspaceReady]);

  const stats = useMemo(() => {
    const pipeline = data.leads
      .filter((lead) => lead.status !== "Perdu")
      .reduce((sum, lead) => sum + lead.value, 0);
    const won = data.leads.filter((lead) => lead.status === "Gagné").reduce((sum, lead) => sum + lead.value, 0);
    const openTasks = data.tasks.filter((task) => task.status !== "Terminé").length;
    const availableProperties = data.properties.filter((property) => property.status === "Disponible").length;
    return { pipeline, won, openTasks, availableProperties };
  }, [data]);


  const actionNotifications = useMemo(() => {
    const items: ActionNotification[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    function daysUntil(dateText?: string) {
      if (!dateText) return null;

      const date = new Date(`${dateText}T00:00:00`);
      if (Number.isNaN(date.getTime())) return null;

      date.setHours(0, 0, 0, 0);
      return Math.round((date.getTime() - today.getTime()) / 86400000);
    }

    function paymentRemaining(quote: QuoteRequest) {
      const total = getQuoteTotal(quote);
      const paid = Number(quote.depositReceived || 0) + Number(quote.balanceReceived || 0);

      return Math.max(total - paid, 0);
    }

    data.tasks
      .filter((task) => task.status !== "Terminé")
      .forEach((task) => {
        const days = daysUntil(task.dueDate);

        if (days === null) {
          items.push({
            id: `task-missing-date-${task.id}`,
            title: "Tâche sans échéance",
            detail: task.title || "Tâche à compléter",
            tab: "tasks",
            tone: "warning",
            targetId: `task-${task.id}`
          });
          return;
        }

        if (days < 0) {
          items.push({
            id: `task-late-${task.id}`,
            title: "Tâche en retard",
            detail: `${task.title} · ${task.dueDate}`,
            tab: "tasks",
            tone: "danger",
            targetId: `task-${task.id}`
          });
          return;
        }

        if (days === 0) {
          items.push({
            id: `task-today-${task.id}`,
            title: "Échéance aujourd’hui",
            detail: task.title,
            tab: "tasks",
            tone: "warning",
            targetId: `task-${task.id}`
          });
          return;
        }

        if (days <= 2) {
          items.push({
            id: `task-soon-${task.id}`,
            title: "Échéance proche",
            detail: `${task.title} · dans ${days} jour${days > 1 ? "s" : ""}`,
            tab: "tasks",
            tone: "info",
            targetId: `task-${task.id}`
          });
        }
      });

    data.leads
      .filter((lead) => lead.status !== "Gagné" && lead.status !== "Perdu")
      .forEach((lead) => {
        if (!lead.nextAction || !lead.dueDate) {
          items.push({
            id: `lead-incomplete-${lead.id}`,
            title: "Lead incomplet",
            detail: `${lead.contactName} · prochaine action ou échéance manquante`,
            tab: "leads",
            tone: "warning",
            targetId: `lead-${lead.id}`
          });
        }

        const days = daysUntil(lead.dueDate);

        if (days !== null && days < 0) {
          items.push({
            id: `lead-late-${lead.id}`,
            title: "Lead en retard",
            detail: `${lead.contactName} · ${lead.nextAction || "Action à faire"}`,
            tab: "leads",
            tone: "danger",
            targetId: `lead-${lead.id}`
          });
        }
      });

    const quotes = mergeQuoteRequests((((data as any).quotes ?? []) as QuoteRequest[]), loadSavedQuotes());

    quotes.forEach((quote) => {
      const status = getQuoteStatus(quote.status);
      const ageDays = getQuoteAgeDays(quote.statusUpdatedAt || quote.createdAt);

      if (status === "Sent" && ageDays >= 1) {
        items.push({
          id: `quote-follow-${quote.id}`,
          title: ageDays >= 3 ? "Relance devis 72h" : "Relance devis 24h",
          detail: `${quote.clientName} · ${formatQuotePrice(getQuoteTotal(quote))}`,
          tab: "quotes",
          tone: ageDays >= 3 ? "danger" : "warning",
          targetId: `quote-${quote.id}`
        });
      }

      if (status === "Negotiation") {
        items.push({
          id: `quote-negotiation-${quote.id}`,
          title: "Négociation à suivre",
          detail: `${quote.clientName} · devis en négociation`,
          tab: "quotes",
          tone: "warning",
          targetId: `quote-${quote.id}`
        });
      }

      if (status === "Accepted") {
        const bookingStatus = quote.bookingStatus || "À préparer";

        if (bookingStatus !== "Terminé" && bookingStatus !== "Annulé") {
          if (!quote.supplierConfirmed) {
            items.push({
              id: `booking-supplier-${quote.id}`,
              title: "Prestataire à confirmer",
              detail: `${quote.clientName} · ${quote.title || "Réservation"}`,
              tab: "bookings",
              tone: "warning",
              targetId: `booking-${quote.id}`
            });
          }

          if (!quote.detailsSent) {
            items.push({
              id: `booking-details-${quote.id}`,
              title: "Détails client à envoyer",
              detail: `${quote.clientName} · réservation confirmée`,
              tab: "bookings",
              tone: "info",
              targetId: `booking-${quote.id}`
            });
          }
        }

        const remaining = paymentRemaining(quote);
        const paymentStatus = quote.paymentStatus || "Non payé";

        if (remaining > 0 && paymentStatus !== "Payé" && paymentStatus !== "Annulé / remboursé") {
          const days = daysUntil(quote.paymentDueDate);

          items.push({
            id: `payment-${quote.id}`,
            title: days !== null && days < 0 ? "Paiement en retard" : "Paiement à suivre",
            detail: `${quote.clientName} · ${formatQuotePrice(remaining)} restant`,
            tab: "bookings",
            tone: days !== null && days < 0 ? "danger" : "warning",
            targetId: `booking-${quote.id}`
          });
        }
      }
    });


    const houseEntries = (((data as any).houseTimeEntries ?? []) as HouseTimeEntry[]);
    const housePayments = (((data as any).housePayments ?? []) as HousePayment[]);
    const houseWorkers = (((data as any).houseTrackingWorkers ?? []) as HouseTrackingWorker[]);

    houseWorkers.forEach((worker) => {
      const due = houseEntries
        .filter((entry) => entry.workerId === worker.id)
        .reduce((sum, entry) => sum + getHouseTimeAmount(entry), 0);
      const paid = housePayments
        .filter((payment) => payment.workerId === worker.id)
        .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      const balance = Math.max(due - paid, 0);

      if (balance > 0) {
        items.push({
          id: `house-balance-${worker.id}`,
          title: "Intervenant à payer",
          detail: `${worker.contactName} · ${currency.format(balance)} restant`,
          tab: "houseTracking",
          tone: "warning",
          targetId: `house-worker-${worker.id}`
        });
      }
    });

    const toneRank: Record<ActionNotification["tone"], number> = {
      danger: 0,
      warning: 1,
      info: 2
    };

    return items
      .sort((first, second) => toneRank[first.tone] - toneRank[second.tone])
      .slice(0, 8);
  }, [data]);

  const filteredContacts = useMemo(() => {
    return data.contacts.filter((contact) => searchMatch(query, [contact.name, contact.kind, contact.email, contact.phone, contact.city, contact.postalAddress ?? "", contact.supplierCategory ?? "", contact.supplierZone ?? "", contact.supplierReliability ?? ""]));
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

  function handleNotificationAction(notification?: ActionNotification) {
    const target = notification ?? actionNotifications[0];

    if (!target) return;

    setActiveTab(target.tab);

    window.setTimeout(() => {
      const targetElement = target.targetId
        ? Array.from(document.querySelectorAll<HTMLElement>("[data-notification-target]")).find((element) =>
            element.dataset.notificationTarget === target.targetId
          )
        : null;

      if (!targetElement) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
      targetElement.classList.add("notification-focus");

      window.setTimeout(() => {
        targetElement.classList.remove("notification-focus");
      }, 3200);
    }, 220);
  }

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


  async function getCurrentCrmUserId() {
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      notify("Contact cloud non synchronisé : utilisateur Supabase non connecté.", "warning");
      return "";
    }

    return userData.user.id;
  }

  async function upsertContactToSupabase(contact: Contact) {
    const userId = await getCurrentCrmUserId();

    if (!userId) return false;

    const { error } = await supabase
      .from("crm_contacts")
      .upsert(contactToSupabaseRow(contact, userId), { onConflict: "id" });

    if (error) {
      notify(`Contact non sauvegardé dans Supabase : ${error.message}`, "warning");
      return false;
    }

    return true;
  }

  async function deleteContactFromSupabase(id: string) {
    const userId = await getCurrentCrmUserId();

    if (!userId) return false;

    const { error } = await supabase
      .from("crm_contacts")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      notify(`Contact non supprimé dans Supabase : ${error.message}`, "warning");
      return false;
    }

    return true;
  }

  async function loadContactsFromSupabaseOnce(isCancelled: () => boolean) {
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user || isCancelled()) return;

    const { data: rows, error } = await supabase
      .from("crm_contacts")
      .select("*")
      .eq("user_id", userData.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      notify(`Contacts cloud non chargés : ${error.message}`, "warning");
      return;
    }

    const cloudContacts = Array.isArray(rows) ? rows.map(contactFromSupabaseRow).filter((contact) => contact.name) : [];

    if (cloudContacts.length > 0) {
      setData((current) => ({
        ...current,
        contacts: cloudContacts
      }));

      notify("Contacts chargés depuis Supabase.");
      return;
    }

    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const localContacts = Array.isArray(parsed?.contacts) ? parsed.contacts as Contact[] : [];

    if (localContacts.length === 0) return;

    const confirmed = window.confirm(
      `La table Contacts Supabase est vide.\n\nCopier ${localContacts.length} contact(s) locaux vers Supabase maintenant ?\n\nClique OK seulement si les contacts affichés dans le CRM sont les bons.`
    );

    if (!confirmed) return;

    const payload = localContacts
      .filter((contact) => contact?.id && contact?.name)
      .map((contact) => contactToSupabaseRow(contact, userData.user.id));

    if (payload.length === 0) return;

    const { error: upsertError } = await supabase
      .from("crm_contacts")
      .upsert(payload, { onConflict: "id" });

    if (upsertError) {
      notify(`Migration contacts impossible : ${upsertError.message}`, "warning");
      return;
    }

    notify(`${payload.length} contact(s) copiés dans Supabase.`);
  }

  useEffect(() => {
    let cancelled = false;

    const timer = window.setTimeout(() => {
      void Promise.resolve(); // crm_contacts désactivé : crm_workspace_state est la base partagée
    }, 700);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  async function saveCrmBackupToSupabase() {
    const currentData = data as any;

    const contactsCount = Array.isArray(currentData.contacts) ? currentData.contacts.length : 0;
    const leadsCount = Array.isArray(currentData.leads) ? currentData.leads.length : 0;
    const propertiesCount = Array.isArray(currentData.properties) ? currentData.properties.length : 0;
    const vehiclesCount = Array.isArray(currentData.vehicles) ? currentData.vehicles.length : 0;
    const boatsCount = Array.isArray(currentData.boats) ? currentData.boats.length : 0;
    const tasksCount = Array.isArray(currentData.tasks) ? currentData.tasks.length : 0;
    const visibleQuotes = mergeQuoteRequests((currentData as any).quotes ?? [], loadSavedQuotes());
    const currentDataWithVisibleQuotes: CRMData = {
      ...currentData,
      quotes: visibleQuotes
    };
    const quotesCount = visibleQuotes.length;

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

    const { error: sharedQuotesError } = await supabase
      .from("crm_workspace_state")
      .upsert({
        workspace_id: SHARED_WORKSPACE_ID,
        payload: currentDataWithVisibleQuotes,
        updated_at: new Date().toISOString()
      });

    if (sharedQuotesError) {
      window.alert(`Sauvegarde devis impossible : ${sharedQuotesError.message}`);
      return;
    }

    setData(currentDataWithVisibleQuotes);
    saveQuotesToBrowser(visibleQuotes);


    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      window.alert("Sauvegarde impossible : utilisateur Supabase non connecté.");
      return;
    }

    const payload = {
      version: "oneaddress-riviera-crm-v1",
      savedAt: new Date().toISOString(),
      data: currentDataWithVisibleQuotes
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
      quotes: mergeQuoteRequests((data as any).quotes ?? [], loadSavedQuotes())
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

  

  function addHouseTrackingHouse(house: HouseTrackingHouse) {
    setData((current) => ({
      ...current,
      houseTrackingHouses: [stampCreated(house, activeActor), ...(((current as any).houseTrackingHouses ?? []) as HouseTrackingHouse[])]
    }));

    notify("Maison ajoutée au suivi.");
  }

  function deleteHouseTrackingHouse(id: string) {
    setData((current) => ({
      ...current,
      houseTrackingHouses: (((current as any).houseTrackingHouses ?? []) as HouseTrackingHouse[]).filter((house) => house.id !== id),
      houseTimeEntries: (((current as any).houseTimeEntries ?? []) as HouseTimeEntry[]).filter((entry) => entry.houseId !== id),
      housePayments: (((current as any).housePayments ?? []) as HousePayment[]).filter((payment) => payment.houseId !== id)
    }));

    notify("Maison supprimée du suivi.");
  }

  function addHouseTrackingWorker(worker: HouseTrackingWorker) {
    setData((current) => ({
      ...current,
      houseTrackingWorkers: [stampCreated(worker, activeActor), ...(((current as any).houseTrackingWorkers ?? []) as HouseTrackingWorker[])]
    }));

    notify("Intervenant ajouté.");
  }

  function deleteHouseTrackingWorker(id: string) {
    setData((current) => ({
      ...current,
      houseTrackingWorkers: (((current as any).houseTrackingWorkers ?? []) as HouseTrackingWorker[]).filter((worker) => worker.id !== id),
      houseTimeEntries: (((current as any).houseTimeEntries ?? []) as HouseTimeEntry[]).filter((entry) => entry.workerId !== id),
      housePayments: (((current as any).housePayments ?? []) as HousePayment[]).filter((payment) => payment.workerId !== id)
    }));

    notify("Intervenant supprimé.");
  }

  function addHouseTimeEntry(entry: HouseTimeEntry) {
    setData((current) => ({
      ...current,
      houseTimeEntries: [stampCreated(entry, activeActor), ...(((current as any).houseTimeEntries ?? []) as HouseTimeEntry[])]
    }));

    notify("Heures ajoutées.");
  }

  function deleteHouseTimeEntry(id: string) {
    setData((current) => ({
      ...current,
      houseTimeEntries: (((current as any).houseTimeEntries ?? []) as HouseTimeEntry[]).filter((entry) => entry.id !== id)
    }));

    notify("Heures supprimées.");
  }

  function addHousePayment(payment: HousePayment) {
    setData((current) => ({
      ...current,
      housePayments: [stampCreated(payment, activeActor), ...(((current as any).housePayments ?? []) as HousePayment[])]
    }));

    notify("Paiement ajouté.");
  }

  function deleteHousePayment(id: string) {
    setData((current) => ({
      ...current,
      housePayments: (((current as any).housePayments ?? []) as HousePayment[]).filter((payment) => payment.id !== id)
    }));

    notify("Paiement supprimé.");
  }

  function addVendorInvoice(invoice: VendorInvoice) {
    setData((current) => ({
      ...current,
      vendorInvoices: [invoice, ...(((current as any).vendorInvoices ?? []) as VendorInvoice[])]
    }));

    notify("Facture fournisseur ajoutée.");
  }

  function updateVendorInvoice(updatedInvoice: VendorInvoice) {
    setData((current) => ({
      ...current,
      vendorInvoices: (((current as any).vendorInvoices ?? []) as VendorInvoice[]).map((invoice) =>
        invoice.id === updatedInvoice.id ? updatedInvoice : invoice
      )
    }));

    notify("Facture fournisseur mise à jour.");
  }

  function deleteVendorInvoice(id: string) {
    setData((current) => ({
      ...current,
      vendorInvoices: (((current as any).vendorInvoices ?? []) as VendorInvoice[]).filter((invoice) => invoice.id !== id)
    }));

    notify("Facture fournisseur supprimée.");
  }

  function addSupplier(supplier: Supplier) {
    setData((current) => ({
      ...current,
      suppliers: [supplier, ...(((current as any).suppliers ?? []) as Supplier[])]
    }));
    notify("Fournisseur ajouté.");
  }

  function updateSupplier(updatedSupplier: Supplier) {
    setData((current) => ({
      ...current,
      suppliers: (((current as any).suppliers ?? []) as Supplier[]).map((supplier) =>
        supplier.id === updatedSupplier.id ? updatedSupplier : supplier
      )
    }));
    notify("Fournisseur mis à jour.");
  }

  function deleteSupplier(id: string) {
    setData((current) => ({
      ...current,
      suppliers: (((current as any).suppliers ?? []) as Supplier[]).filter((supplier) => supplier.id !== id)
    }));
    notify("Fournisseur supprimé.");
  }

function addContact(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const contact: Contact = stampCreated({
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
      supplierCategory: String(form.get("supplierCategory") ?? "").trim() as Contact["supplierCategory"],
      supplierContactName: String(form.get("supplierContactName") ?? "").trim(),
      supplierZone: String(form.get("supplierZone") ?? "").trim(),
      supplierQuality: String(form.get("supplierQuality") ?? "Standard") as Contact["supplierQuality"],
      supplierReliability: String(form.get("supplierReliability") ?? "À tester") as Contact["supplierReliability"],
      supplierPriceNotes: String(form.get("supplierPriceNotes") ?? "").trim(),
      supplierCommissionNotes: String(form.get("supplierCommissionNotes") ?? "").trim(),
      supplierStatus: String(form.get("supplierStatus") ?? "Actif") as Contact["supplierStatus"],
      createdAt: new Date().toISOString().slice(0, 10)
    }, activeActor) as Contact;
    if (!contact.name) return notify("Ajoutez au minimum un nom de contact.", "warning");
    if (!confirmDuplicateContact(contact)) return;
    setData((current) => ({ ...current, contacts: [contact, ...current.contacts] }));
    // Ancienne synchro contact désactivée : crm_workspace_state sauvegarde tout le CRM.
    event.currentTarget.reset();
    notify("Contact ajouté.");

    window.setTimeout(() => {
      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    }, 80);
  }

  function addLead(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const assetSelection = parseAssetKey(form.get("assetKey"));

    const lead: Lead = stampCreated({
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
    }, activeActor) as Lead;

    if (!lead.contactName) return notify("Sélectionnez un contact pour ce lead.", "warning");

    if (isOpenLead(lead) && (!lead.nextAction.trim() || !lead.dueDate)) {
      return notify("Un lead ouvert doit avoir une prochaine action et une échéance.", "warning");
    }

    if (!confirmDuplicateLead(lead)) return;

    const draftQuote = stampCreated(createDraftQuoteFromLead(lead), activeActor) as QuoteRequest;
    const nextLocalQuotes = mergeQuoteRequests(loadSavedQuotes(), [draftQuote]);

    saveQuotesToBrowser(nextLocalQuotes);

    setData((current) => ({
      ...current,
      leads: [lead, ...current.leads],
      quotes: mergeQuoteRequests((((current as any).quotes ?? []) as QuoteRequest[]), [draftQuote])
    }));
    event.currentTarget.reset();
    setLeadDraftContactName("");
    notify("Lead ajouté au pipeline.");
  }

  function addProperty(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const property: Property = stampCreated({
      id: makeId("p"),
      name: String(form.get("name") ?? "").trim(),
      city: String(form.get("city") ?? "").trim(),
      type: String(form.get("type") ?? "Villa").trim(),
      price: safeNumber(form.get("price")),
      status: String(form.get("status") ?? "Disponible") as PropertyStatus,
      owner: String(form.get("owner") ?? "").trim(),
      bedrooms: safeNumber(form.get("bedrooms")),
      surface: safeNumber(form.get("surface"))
    }, activeActor) as Property;
    if (!property.name) return notify("Ajoutez au minimum un nom de bien.", "warning");
    if (!confirmDuplicateAsset("bien", property)) return;
    setData((current) => ({ ...current, properties: [property, ...current.properties] }));
    event.currentTarget.reset();
    notify("Bien ajouté.");
  }

  function addVehicle(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const vehicle: Vehicle = stampCreated({
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
    }, activeActor) as Vehicle;
    if (!vehicle.name) return notify("Ajoutez au minimum un nom de voiture.", "warning");
    if (!confirmDuplicateAsset("voiture", vehicle)) return;
    setData((current) => ({ ...current, vehicles: [vehicle, ...(current.vehicles ?? [])] }));
    event.currentTarget.reset();
    notify("Voiture ajoutée.");
  }

  function addBoat(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const boat: Boat = stampCreated({
      id: makeId("b"),
      name: String(form.get("name") ?? "").trim(),
      port: String(form.get("port") ?? "").trim(),
      type: String(form.get("type") ?? "Yacht").trim(),
      price: safeNumber(form.get("price")),
      status: String(form.get("status") ?? "Disponible") as BoatStatus,
      owner: String(form.get("owner") ?? "").trim(),
      year: safeNumber(form.get("year")),
      length: safeNumber(form.get("length"))
    }, activeActor) as Boat;
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
        property.id === updatedProperty.id ? stampUpdated(updatedProperty, activeActor) as Property : property
      )
    }));

    notify("Bien mis à jour.");
  }

  function updateVehicle(updatedVehicle: Vehicle) {
    setData((current) => ({
      ...current,
      vehicles: (current.vehicles ?? []).map((vehicle) =>
        vehicle.id === updatedVehicle.id ? stampUpdated(updatedVehicle, activeActor) as Vehicle : vehicle
      )
    }));

    notify("Voiture mise à jour.");
  }

  function updateBoat(updatedBoat: Boat) {
    setData((current) => ({
      ...current,
      boats: (current.boats ?? []).map((boat) =>
        boat.id === updatedBoat.id ? stampUpdated(updatedBoat, activeActor) as Boat : boat
      )
    }));

    notify("Bateau mis à jour.");
  }

  function addTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const task: Task = stampCreated({
      id: makeId("t"),
      title: String(form.get("title") ?? "").trim(),
      owner: String(form.get("owner") ?? "").trim() || activeActor,
      status: String(form.get("status") ?? "À faire") as TaskStatus,
      dueDate: String(form.get("dueDate") ?? ""),
      linkedTo: String(form.get("linkedTo") ?? "").trim()
    }, activeActor) as Task;
    if (!task.title) return notify("Ajoutez au minimum un titre de tâche.", "warning");
    setData((current) => ({ ...current, tasks: [task, ...current.tasks] }));
    event.currentTarget.reset();
    setTaskDraftLeadId("");
    setTaskDraftTitle("");
    notify("Tâche ajoutée.");
  }

  function addPlanningEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const assetSelection = parseAssetKey(form.get("assetKey"));
    const start = String(form.get("startDate") ?? "");
    const end = String(form.get("endDate") ?? "") || start;

    const entry = stampCreated({
      id: makeId("planning"),
      title: String(form.get("title") ?? "").trim(),
      type: String(form.get("type") ?? "Intervention fournisseur") as PlanningEntryType,
      contactName: String(form.get("contactName") ?? "").trim(),
      assetType: assetSelection.assetType,
      assetId: assetSelection.assetId,
      startDate: start,
      endDate: end,
      blocksAvailability: String(form.get("blocksAvailability") ?? "false") === "true",
      notes: String(form.get("notes") ?? "").trim()
    }, activeActor) as PlanningEntry;

    if (!entry.title) return notify("Ajoutez au minimum un titre planning.", "warning");
    if (!isValidPlanningDate(entry.startDate)) return notify("Ajoutez une date de début valide.", "warning");
    if (!isValidPlanningDate(entry.endDate)) return notify("Ajoutez une date de fin valide.", "warning");
    if (planningDateValue(entry.endDate) < planningDateValue(entry.startDate)) {
      return notify("La date de fin ne peut pas être avant la date de début.", "warning");
    }

    setData((current) => ({
      ...current,
      planningEntries: [entry, ...(((current as any).planningEntries ?? []) as PlanningEntry[])]
    }));

    event.currentTarget.reset();
    notify("Événement ajouté au planning.");
  }

  function deletePlanningEntry(id: string) {
    const confirmed = window.confirm("Supprimer cette entrée du planning ?");

    if (!confirmed) return;

    setData((current) => ({
      ...current,
      planningEntries: (((current as any).planningEntries ?? []) as PlanningEntry[]).filter((entry) => entry.id !== id)
    }));

    notify("Entrée planning supprimée.");
  }

  function updatePlanningEntry(id: string, event: React.FormEvent<HTMLFormElement>): boolean {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const assetSelection = parseAssetKey(form.get("assetKey"));
    const start = String(form.get("startDate") ?? "");
    const end = String(form.get("endDate") ?? "") || start;

    const nextEntry = {
      title: String(form.get("title") ?? "").trim(),
      type: String(form.get("type") ?? "Intervention fournisseur") as PlanningEntryType,
      contactName: String(form.get("contactName") ?? "").trim(),
      assetType: assetSelection.assetType,
      assetId: assetSelection.assetId,
      startDate: start,
      endDate: end,
      blocksAvailability: String(form.get("blocksAvailability") ?? "false") === "true",
      notes: String(form.get("notes") ?? "").trim()
    };

    if (!nextEntry.title) {
      notify("Ajoutez au minimum un titre planning.", "warning");
      return false;
    }

    if (!isValidPlanningDate(nextEntry.startDate)) {
      notify("Ajoutez une date de début valide.", "warning");
      return false;
    }

    if (!isValidPlanningDate(nextEntry.endDate)) {
      notify("Ajoutez une date de fin valide.", "warning");
      return false;
    }

    if (planningDateValue(nextEntry.endDate) < planningDateValue(nextEntry.startDate)) {
      notify("La date de fin ne peut pas être avant la date de début.", "warning");
      return false;
    }

    setData((current) => ({
      ...current,
      planningEntries: (((current as any).planningEntries ?? []) as PlanningEntry[]).map((entry) =>
        entry.id === id ? stampUpdated({ ...entry, ...nextEntry }, activeActor) as PlanningEntry : entry
      )
    }));

    notify("Entrée planning mise à jour.");
    return true;
  }

  function updateLead(updatedLead: Lead) {
    setData((current) => ({
      ...current,
      leads: current.leads.map((lead) =>
        lead.id === updatedLead.id ? stampUpdated(updatedLead, activeActor) as Lead : lead
      )
    }));

    notify("Lead mis à jour.");
  }

  function updateLeadStatus(id: string, status: LeadStatus) {
    setData((current) => ({
      ...current,
      leads: current.leads.map((lead) => (lead.id === id ? stampUpdated({ ...lead, status }, activeActor) as Lead : lead))
    }));
  }

  
  function syncLeadFromQuote(quote: QuoteRequest) {
    if (!quote.leadId) return;

    const quoteItems = getQuoteItems(quote);
    const mainCategory = quoteItems[0]?.category || quote.categories?.[0] || "";
    const quoteValue = getQuoteTotal(quote);
    const leadStatus = getLeadStatusFromQuoteStatus(quote.status);

    setData((current) => ({
      ...current,
      quotes: mergeQuoteRequests((((current as any).quotes ?? []) as QuoteRequest[]), [stampUpdated(quote, activeActor) as QuoteRequest]),
      leads: current.leads.map((lead) =>
        lead.id === quote.leadId
          ? stampUpdated({
              ...lead,
              category: (mainCategory || lead.category) as Lead["category"],
              rentalStartDate: quote.startDate || lead.rentalStartDate,
              rentalEndDate: quote.endDate || lead.rentalEndDate,
              value: quoteValue,
              status: leadStatus
            }, activeActor) as Lead
          : lead
      )
    }));

    saveQuotesToBrowser(mergeQuoteRequests(loadSavedQuotes(), [quote]));
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

    const existingQuote = mergeQuoteRequests((((data as any).quotes ?? []) as QuoteRequest[]), loadSavedQuotes())
      .find((quote) => quote.leadId === lead.id);

    if (existingQuote) {
      setQuoteDraftFromLead({
        key: `${lead.id}-${existingQuote.id}-${Date.now()}`,
        leadId: lead.id,
        quoteId: existingQuote.id,
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

      notify(`Devis existant ouvert pour ${lead.contactName}.`);
      return;
    }

    setQuoteDraftFromLead({
      key: `${lead.id}-${Date.now()}`,
      leadId: lead.id,
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
        task.id === updatedTask.id ? stampUpdated(updatedTask, activeActor) as Task : task
      )
    }));

    notify("Tâche mise à jour.");
  }

  function updateTaskStatus(id: string, status: TaskStatus) {
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((task) => (task.id === id ? stampUpdated({ ...task, status }, activeActor) as Task : task))
    }));
  }

  function updateContact(updatedContact: Contact) {
    setData((current) => ({
      ...current,
      contacts: current.contacts.map((contact) =>
        contact.id === updatedContact.id ? stampUpdated(updatedContact, activeActor) as Contact : contact
      )
    }));

    // Ancienne synchro contact désactivée : crm_workspace_state sauvegarde tout le CRM.

    notify("Contact mis à jour.");
  }

  function deleteContact(id: string) {
    setData((current) => ({ ...current, contacts: current.contacts.filter((contact) => contact.id !== id) }));
    // Ancienne suppression contact désactivée : crm_workspace_state sauvegarde tout le CRM.

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

        const knownKeys = ["contacts", "leads", "properties", "vehicles", "boats", "tasks", "suppliers", "quotes", "vendorInvoices", "houseTrackingHouses", "houseTrackingWorkers", "houseTimeEntries", "housePayments"];
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
        <NavButton label="Réservations" icon="✓" active={activeTab === "bookings"} onClick={() => setActiveTab("bookings")} />
        <NavButton label="Factures fournisseurs" icon="€" active={activeTab === "vendorInvoices"} onClick={() => setActiveTab("vendorInvoices")} />
        <NavButton label="Suivi maison" icon="⏱" active={activeTab === "houseTracking"} onClick={() => setActiveTab("houseTracking")} />
        <NavButton label="Réponses rapides" icon="💬" active={activeTab === "quickReplies"} onClick={() => setActiveTab("quickReplies")} />
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
            <label className="actor-select-label">
              <span>Actions par</span>
              <select value={activeActor} onChange={(event) => setActiveActor(event.target.value as CRMActor)}>
                {crmActors.map((actor) => <option key={actor}>{actor}</option>)}
              </select>
            </label>
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

        {actionNotifications.length > 0 && (
          <section className="crm-notification-panel">
            <div className="crm-notification-heading">
              <div>
                <p className="eyebrow">Notifications</p>
                <h3>{actionNotifications.length} action{actionNotifications.length > 1 ? "s" : ""} à traiter</h3>
              </div>

              <button
                className="secondary-button"
                type="button"
                onClick={() => handleNotificationAction()}
              >
                Traiter maintenant
              </button>
            </div>

            <div className="crm-notification-list">
              {actionNotifications.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`crm-notification-item ${item.tone}`}
                  onClick={() => handleNotificationAction(item)}
                >
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </button>
              ))}
            </div>
          </section>
        )}

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
              quotes={mergeQuoteRequests((data as any).quotes ?? [], loadSavedQuotes())}
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

        {activeTab === "quickReplies" && (
          <QuickRepliesView />
        )}

{activeTab === "quotes" && (
          <QuotesView
            contacts={data.contacts}
            prefilledLead={quoteDraftFromLead}
            quotes={mergeQuoteRequests((data as any).quotes ?? [], loadSavedQuotes())}
            activeActor={activeActor}
            onChange={(nextQuotes) => setData((current) => ({ ...current, quotes: nextQuotes }))}
            onQuoteChange={syncLeadFromQuote}
          />
        )}

        {activeTab === "bookings" && (
          <BookingsView
            quotes={mergeQuoteRequests((data as any).quotes ?? [], loadSavedQuotes())}
            contacts={data.contacts}
            activeActor={activeActor}
            onChange={(nextQuotes) => setData((current) => ({ ...current, quotes: nextQuotes }))}
          />
        )}

        {activeTab === "vendorInvoices" && (
          <VendorInvoicesView
            contacts={data.contacts}
            invoices={(((data as any).vendorInvoices ?? []) as VendorInvoice[])}
            onAdd={addVendorInvoice}
            onUpdate={updateVendorInvoice}
            onDelete={deleteVendorInvoice}
          />
        )}

        {activeTab === "houseTracking" && (
          <HouseTrackingView
            contacts={data.contacts}
            houses={(((data as any).houseTrackingHouses ?? []) as HouseTrackingHouse[])}
            workers={(((data as any).houseTrackingWorkers ?? []) as HouseTrackingWorker[])}
            timeEntries={(((data as any).houseTimeEntries ?? []) as HouseTimeEntry[])}
            payments={(((data as any).housePayments ?? []) as HousePayment[])}
            onAddHouse={addHouseTrackingHouse}
            onDeleteHouse={deleteHouseTrackingHouse}
            onAddWorker={addHouseTrackingWorker}
            onDeleteWorker={deleteHouseTrackingWorker}
            onAddTimeEntry={addHouseTimeEntry}
            onDeleteTimeEntry={deleteHouseTimeEntry}
            onAddPayment={addHousePayment}
            onDeletePayment={deleteHousePayment}
          />
        )}

        {activeTab === "planning" && (
          <PlanningView
            leads={data.leads}
            properties={data.properties}
            vehicles={data.vehicles ?? []}
            boats={data.boats ?? []}
            contacts={data.contacts}
            planningEntries={(((data as any).planningEntries ?? []) as PlanningEntry[])}
            onAddPlanningEntry={addPlanningEntry}
            onUpdatePlanningEntry={updatePlanningEntry}
            onDeletePlanningEntry={deletePlanningEntry}
          />
        )}

        {activeTab === "leads" && (
          <LeadsView leads={filteredLeads} contacts={data.contacts} tasks={data.tasks} quotes={mergeQuoteRequests((data as any).quotes ?? [], loadSavedQuotes())} properties={data.properties} vehicles={data.vehicles ?? []} boats={data.boats ?? []} preselectedContactName={leadDraftContactName} onAdd={addLead} onUpdate={updateLead} onStatusChange={updateLeadStatus} onDelete={deleteLead} onCreateQuote={createQuoteDraftFromLead} onCreateTask={(lead: Lead) => {
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
    bookings: "Réservations",
    vendorInvoices: "Factures fournisseurs",
    houseTracking: "Suivi maison",
    quickReplies: "Réponses rapides",
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

const planningEntryTypes: PlanningEntryType[] = [
  "Intervention fournisseur",
  "Maintenance",
  "Tâche interne",
  "Réservation",
  "Autre"
];

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
  boats,
  contacts,
  planningEntries,
  onAddPlanningEntry,
  onUpdatePlanningEntry,
  onDeletePlanningEntry
}: {
  leads: Lead[];
  properties: Property[];
  vehicles: Vehicle[];
  boats: Boat[];
  contacts: Contact[];
  planningEntries: PlanningEntry[];
  onAddPlanningEntry: (event: React.FormEvent<HTMLFormElement>) => void;
  onUpdatePlanningEntry: (id: string, event: React.FormEvent<HTMLFormElement>) => boolean;
  onDeletePlanningEntry: (id: string) => void;
}) {
  const [categoryFilter, setCategoryFilter] = useState("Tous");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => formatPlanningMonthValue(new Date()));
  const [editingPlanningEntry, setEditingPlanningEntry] = useState<PlanningEntry | null>(null);

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

  const assetOptions = useMemo(() => {
    return assets.map((asset) => ({
      key: `${asset.type}:${asset.id}`,
      label: `${asset.label} · ${asset.category}`
    }));
  }, [assets]);

  const supplierContacts = useMemo(() => {
    return contacts
      .filter((contact) => contact.kind === "Fournisseur" || Boolean(contact.supplierCategory))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [contacts]);

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
    const leadEvents = [
      ...confirmedBookings.map((booking) => ({
        ...booking,
        source: "lead" as const,
        planningLabel: "Confirmé",
        blocksAvailability: true
      })),
      ...pendingBookings.map((booking) => ({
        ...booking,
        source: "lead" as const,
        planningLabel: booking.status,
        blocksAvailability: false
      }))
    ];

    const planningEntryEvents = planningEntries
      .filter((entry) => isValidPlanningDate(entry.startDate) && isValidPlanningDate(entry.endDate || entry.startDate))
      .map((entry) => {
        const asset = assets.find((item) => item.type === entry.assetType && item.id === entry.assetId);

        return {
          id: entry.id,
          source: "planning" as const,
          assetType: entry.assetType || "",
          assetId: entry.assetId || "",
          assetLabel: asset?.label || entry.title,
          assetCategory: asset?.category || entry.type,
          contactName: entry.contactName || entry.type,
          startDate: entry.startDate,
          endDate: entry.endDate || entry.startDate,
          value: 0,
          nextAction: entry.notes || "",
          planningLabel: entry.type,
          blocksAvailability: Boolean(entry.blocksAvailability)
        };
      });

    return [...leadEvents, ...planningEntryEvents]
      .sort((a, b) => planningDateValue(a.startDate) - planningDateValue(b.startDate));
  }, [confirmedBookings, pendingBookings, planningEntries, assets]);

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

  function startPlanningEntryEdit(entry: PlanningEntry) {
    setEditingPlanningEntry(entry);

    requestAnimationFrame(() => {
      document.querySelector('[data-planning-entry-form="true"]')?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function cancelPlanningEntryEdit() {
    setEditingPlanningEntry(null);
  }

  const editingPlanningAssetKey = editingPlanningEntry?.assetType && editingPlanningEntry?.assetId
    ? `${editingPlanningEntry.assetType}:${editingPlanningEntry.assetId}`
    : "";

  return (
    <div className="stack">
      <section className="card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Planning</p>
            <h3>Disponibilités, réservations & interventions</h3>
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

      <section className="card" data-planning-entry-form="true">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Planning interne</p>
            <h3>{editingPlanningEntry ? "Modifier une intervention" : "Ajouter une intervention ou une maintenance"}</h3>
          </div>
        </div>

        <form
          className="form-grid compact"
          key={editingPlanningEntry?.id ?? "new-planning-entry"}
          onSubmit={(event) => {
            if (!editingPlanningEntry) {
              onAddPlanningEntry(event);
              return;
            }

            const updated = onUpdatePlanningEntry(editingPlanningEntry.id, event);

            if (updated) {
              setEditingPlanningEntry(null);
            }
          }}
        >
          <label>Titre
            <input name="title" defaultValue={editingPlanningEntry?.title ?? ""} placeholder="Gardens Jardinier · entretien jardin" required />
          </label>

          <label>Type
            <select name="type" defaultValue={editingPlanningEntry?.type ?? "Intervention fournisseur"}>
              {planningEntryTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>

          <label>Contact / fournisseur
            <select name="contactName" defaultValue={editingPlanningEntry?.contactName ?? ""}>
              <option value="">Aucun contact lié</option>
              {supplierContacts.map((contact) => (
                <option key={contact.id} value={contact.name}>{contact.name}</option>
              ))}
              {contacts
                .filter((contact) => contact.kind !== "Fournisseur" && !contact.supplierCategory)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((contact) => (
                  <option key={contact.id} value={contact.name}>{contact.name}</option>
                ))}
            </select>
          </label>

          <label>Actif lié
            <select name="assetKey" defaultValue={editingPlanningAssetKey}>
              <option value="">Aucun actif lié</option>
              {assetOptions.map((asset) => (
                <option key={asset.key} value={asset.key}>{asset.label}</option>
              ))}
            </select>
          </label>

          <label>Date début
            <input type="date" name="startDate" defaultValue={editingPlanningEntry?.startDate ?? ""} required />
          </label>

          <label>Date fin
            <input type="date" name="endDate" defaultValue={editingPlanningEntry?.endDate ?? ""} />
          </label>

          <label>Bloque la disponibilité
            <select name="blocksAvailability" defaultValue={editingPlanningEntry?.blocksAvailability ? "true" : "false"}>
              <option value="false">Non</option>
              <option value="true">Oui</option>
            </select>
          </label>

          <label>Notes
            <textarea name="notes" defaultValue={editingPlanningEntry?.notes ?? ""} placeholder="Détails internes, horaires, consignes..." />
          </label>

          <button className="primary-button" type="submit">
            {editingPlanningEntry ? "Enregistrer les modifications" : "Ajouter au planning"}
          </button>

          {editingPlanningEntry && (
            <button className="ghost-button" type="button" onClick={cancelPlanningEntryEdit}>
              Annuler
            </button>
          )}
        </form>

        <div className="planning-legend">
          <span><i className="legend-dot blocked" /> Rouge = planning rempli / disponibilité bloquée</span>
          <span><i className="legend-dot entry" /> Doré = intervention non bloquante</span>
        </div>

        <div className="list-stack">
          {planningEntries.length === 0 ? (
            <p className="muted-line">Aucune intervention interne. Ajoutez ici les fournisseurs, maintenances et passages qui ne doivent pas devenir des leads.</p>
          ) : (
            planningEntries
              .slice()
              .sort((a, b) => planningDateValue(a.startDate || "9999-12-31") - planningDateValue(b.startDate || "9999-12-31"))
              .map((entry) => {
                const asset = assets.find((item) => item.type === entry.assetType && item.id === entry.assetId);

                return (
                  <article className="mini-row" key={entry.id} data-notification-target={`planning-${entry.id}`}>
                    <div>
                      <strong>{entry.title}</strong>
                      <span>{entry.type} · {formatDateFR(entry.startDate)}{entry.endDate && entry.endDate !== entry.startDate ? ` → ${formatDateFR(entry.endDate)}` : ""}</span>
                      <span>{entry.contactName || "Aucun contact lié"}{asset ? ` · ${asset.label}` : ""}</span>
                      {entry.notes && <span>{entry.notes}</span>}
                      <ActionMeta item={entry} />
                    </div>
                    <div className="item-actions planning-entry-actions">
                      <Badge>{entry.blocksAvailability ? "Bloquant" : "Non bloquant"}</Badge>
                      <button className="asset-edit-button" type="button" onClick={() => startPlanningEntryEdit(entry)}>Modifier</button>
                      <button
                        className="icon-button danger"
                        type="button"
                        aria-label="Supprimer"
                        onClick={() => {
                          if (editingPlanningEntry?.id === entry.id) {
                            setEditingPlanningEntry(null);
                          }

                          onDeletePlanningEntry(entry.id);
                        }}
                      >×</button>
                    </div>
                  </article>
                );
              })
          )}
        </div>
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

                    const hasBlockingEvent = events.some((event) => event.blocksAvailability);
                    const dayClassName = [
                      "planning-day",
                      events.length > 0 ? "planning-day-filled" : "",
                      hasBlockingEvent ? "planning-day-blocked" : ""
                    ].filter(Boolean).join(" ");

                    return (
                      <td key={`${weekIndex}-${dayIndex}`} className={day ? dayClassName : "planning-day-empty"}>
                        {day ? (
                          <div>
                            <strong>{day.day}</strong>

                            {events.length === 0 ? (
                              <span className="muted-line">Disponible</span>
                            ) : (
                              events.slice(0, 4).map((event) => (
                                <span
                                  className={`planning-event-pill ${event.blocksAvailability ? "blocked" : event.source === "planning" ? "entry" : "option"}`}
                                  key={`${event.source}-${event.id}`}
                                >
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


function getQuoteStatusAgeDays(quote: QuoteRequest) {
  return getQuoteAgeDays(quote.statusUpdatedAt || quote.createdAt);
}

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
      const ageDays = getQuoteStatusAgeDays(quote);

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

  const cockpitQuotes = mergeQuoteRequests((((data as any).quotes ?? []) as QuoteRequest[]), loadSavedQuotes());
  const confirmedBookings = cockpitQuotes.filter((quote) => getQuoteStatus(quote.status) === "Accepted");

  function getDashboardPaymentRemaining(quote: QuoteRequest) {
    const total = getQuoteTotal(quote);
    const paid = Number(quote.depositReceived || 0) + Number(quote.balanceReceived || 0);

    return Math.max(total - paid, 0);
  }

  function getDashboardMargin(quote: QuoteRequest) {
    return getQuoteTotal(quote) - Number(quote.supplierCost || 0);
  }

  const quotesToFollow = cockpitQuotes
    .filter((quote) => {
      const status = getQuoteStatus(quote.status);
      const ageDays = getQuoteAgeDays(quote.statusUpdatedAt || quote.createdAt);

      return (status === "Sent" && ageDays >= 1) || status === "Negotiation";
    })
    .slice(0, 5);

  const bookingsToPrepare = confirmedBookings
    .filter((quote) => {
      const status = quote.bookingStatus || "À préparer";
      return status !== "Terminé" && status !== "Annulé";
    })
    .slice(0, 5);

  const paymentsToFollow = confirmedBookings
    .filter((quote) => {
      const status = quote.paymentStatus || "Non payé";
      return status !== "Payé" && status !== "Annulé / remboursé" && getDashboardPaymentRemaining(quote) > 0;
    })
    .slice(0, 5);

  const confirmedRevenue = confirmedBookings.reduce((sum, quote) => sum + getQuoteTotal(quote), 0);
  const estimatedMargin = confirmedBookings.reduce((sum, quote) => sum + getDashboardMargin(quote), 0);
  const remainingPayments = confirmedBookings.reduce((sum, quote) => sum + getDashboardPaymentRemaining(quote), 0);

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

      <section className="card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Cockpit</p>
            <h3>Ce qui demande une action</h3>
          </div>
        </div>

        <div className="stats-grid">
          <StatCard label="CA confirmé" value={currency.format(confirmedRevenue)} caption="Total des devis gagnés" />
          <StatCard label="Marge estimée" value={currency.format(estimatedMargin)} caption="Prix client - coût fournisseur" />
          <StatCard label="Paiements restants" value={currency.format(remainingPayments)} caption="Solde encore à recevoir" />
          <StatCard label="Réservations à préparer" value={String(bookingsToPrepare.length)} caption="Services gagnés non terminés" />
        </div>

        <div className="three-columns" style={{ marginTop: 18 }}>
          <div className="mini-panel">
            <p className="eyebrow">Devis</p>
            <h4>À relancer</h4>

            <div className="list-stack">
              {quotesToFollow.length === 0 ? (
                <p className="muted-line">Aucun devis urgent à relancer.</p>
              ) : (
                quotesToFollow.map((quote) => (
                  <article className="mini-row" key={quote.id}>
                    <div>
                      <strong>{quote.clientName}</strong>
                      <span>{getQuoteStatusFrenchLabel(getQuoteStatus(quote.status))} · {currency.format(getQuoteSubtotal(quote))}</span>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>

          <div className="mini-panel">
            <p className="eyebrow">Réservations</p>
            <h4>À préparer</h4>

            <div className="list-stack">
              {bookingsToPrepare.length === 0 ? (
                <p className="muted-line">Aucune réservation à préparer.</p>
              ) : (
                bookingsToPrepare.map((quote) => (
                  <article className="mini-row" key={quote.id}>
                    <div>
                      <strong>{quote.clientName}</strong>
                      <span>{quote.bookingStatus || "À préparer"} · {quote.startDate || "Date à compléter"}</span>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>

          <div className="mini-panel">
            <p className="eyebrow">Paiements</p>
            <h4>À suivre</h4>

            <div className="list-stack">
              {paymentsToFollow.length === 0 ? (
                <p className="muted-line">Aucun paiement urgent à suivre.</p>
              ) : (
                paymentsToFollow.map((quote) => (
                  <article className="mini-row" key={quote.id}>
                    <div>
                      <strong>{quote.clientName}</strong>
                      <span>{currency.format(getDashboardPaymentRemaining(quote))} restant · {quote.paymentDueDate ? formatQuoteDate(quote.paymentDueDate) : "Sans limite"}</span>
                    </div>
                  </article>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

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
  const [contactFilter, setContactFilter] = useState("Tous");
  const [supplierCategoryFilter, setSupplierCategoryFilter] = useState("Toutes");
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  const filterOptions = ["Tous", "Clients", "Fournisseurs", "Propriétaires", "Partenaires"];

  function getContactLeads(contact: Contact) {
    return leads.filter((lead) => lead.contactName === contact.name);
  }

  function getContactTasks(contact: Contact) {
    const contactLeads = getContactLeads(contact);
    const leadIds = new Set(contactLeads.map((lead) => lead.id));

    return tasks.filter((task) => leadIds.has(task.linkedTo));
  }

  const visibleContacts = contacts.filter((contact) => {
    const supplier = isSupplierContact(contact);
    const matchesType =
      contactFilter === "Tous" ||
      (contactFilter === "Clients" && contact.kind === "Client" && !supplier) ||
      (contactFilter === "Fournisseurs" && supplier) ||
      (contactFilter === "Propriétaires" && contact.kind === "Propriétaire") ||
      (contactFilter === "Partenaires" && contact.kind === "Partenaire");

    const matchesSupplierCategory = supplierCategoryFilter === "Toutes" || getContactSupplierCategory(contact) === supplierCategoryFilter;

    return matchesType && (contactFilter === "Fournisseurs" ? matchesSupplierCategory : true);
  });

  const clientCount = contacts.filter((contact) => contact.kind === "Client" && !isSupplierContact(contact)).length;
  const supplierCount = contacts.filter(isSupplierContact).length;
  const ownerCount = contacts.filter((contact) => contact.kind === "Propriétaire").length;
  const partnerCount = contacts.filter((contact) => contact.kind === "Partenaire").length;

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
      importantNotes: String(form.get("importantNotes") ?? "").trim(),
      supplierCategory: String(form.get("supplierCategory") ?? "").trim() as Contact["supplierCategory"],
      supplierContactName: String(form.get("supplierContactName") ?? "").trim(),
      supplierZone: String(form.get("supplierZone") ?? "").trim(),
      supplierQuality: String(form.get("supplierQuality") ?? "Standard") as Contact["supplierQuality"],
      supplierReliability: String(form.get("supplierReliability") ?? "À tester") as Contact["supplierReliability"],
      supplierPriceNotes: String(form.get("supplierPriceNotes") ?? "").trim(),
      supplierCommissionNotes: String(form.get("supplierCommissionNotes") ?? "").trim(),
      supplierStatus: String(form.get("supplierStatus") ?? "Actif") as Contact["supplierStatus"]
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

  function typeLabel(contact: Contact) {
    return isSupplierContact(contact) ? "Fournisseur" : contact.kind;
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Contacts</p>
            <h3>{visibleContacts.length} contact{visibleContacts.length > 1 ? "s" : ""}</h3>
          </div>
          <p className="muted-line">Clients et réseau fournisseurs au même endroit. Filtrez vite, ouvrez uniquement si nécessaire.</p>
        </div>

        <div className="stats-grid">
          <StatCard label="Clients" value={String(clientCount)} caption="Demandes et leads" />
          <StatCard label="Fournisseurs" value={String(supplierCount)} caption="Prestataires activables" />
          <StatCard label="Propriétaires" value={String(ownerCount)} caption="Actifs privés" />
          <StatCard label="Partenaires" value={String(partnerCount)} caption="Apporteurs / réseau" />
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 20 }}>
          {filterOptions.map((option) => (
            <button
              key={option}
              type="button"
              className={contactFilter === option ? "primary-button" : "secondary-button"}
              onClick={() => setContactFilter(option)}
            >
              {option}
            </button>
          ))}
        </div>

        {contactFilter === "Fournisseurs" && (
          <div style={{ marginTop: 16 }}>
            <label>Service fournisseur
              <select value={supplierCategoryFilter} onChange={(event) => setSupplierCategoryFilter(event.target.value)}>
                <option>Toutes</option>
                {supplierCategories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
          </div>
        )}
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(320px, 0.8fr)", gap: 24, alignItems: "start" }}>
        <section className="card">
          {visibleContacts.length === 0 ? (
            <p className="muted-line">Aucun contact dans ce filtre.</p>
          ) : (
            <div className="list-stack">
              {visibleContacts.map((contact) => (
                <article className="item-card" key={contact.id}>
                  <div>
                    <p className="eyebrow">
                      {typeLabel(contact)}{isSupplierContact(contact) ? ` · ${getContactSupplierCategory(contact)}` : ""}
                    </p>
                    <h3>{contact.name}</h3>
                    <p className="muted-line">
                      {contact.city || getContactSupplierZone(contact) || "Ville / zone à compléter"}
                    </p>
                    <p className="muted-line">
                      {contact.email || "Email à compléter"} · {contact.phone || "Téléphone à compléter"}
                    </p>
                    <ActionMeta item={contact} />
                    {isSupplierContact(contact) ? (
                      <p className="muted-line">
                        Fiabilité : {contact.supplierReliability || "À tester"} · Statut : {contact.supplierStatus || "Actif"}
                      </p>
                    ) : (
                      <p className="muted-line">
                        {getContactClientLevel(contact)} · {getContactRelationshipStatus(contact)} · {getContactLeads(contact).length} lead{getContactLeads(contact).length > 1 ? "s" : ""}
                      </p>
                    )}
                  </div>

                  <div className="item-actions">
                    {contact.phone && <a className="secondary-button" href={`tel:${contact.phone}`}>Appeler</a>}
                    {contact.email && <a className="secondary-button" href={`mailto:${contact.email}`}>Email</a>}
                    {!isSupplierContact(contact) && (
                      <button className="secondary-button" type="button" onClick={() => onCreateLead(contact.name)}>
                        Lead
                      </button>
                    )}
                    <button className="secondary-button" type="button" onClick={() => setSelectedContact(contact)}>
                      Détails
                    </button>
                    <button className="secondary-button" type="button" onClick={() => openEdit(contact)}>
                      Modifier
                    </button>
                    <button
                      className="danger-button"
                      type="button"
                      onClick={() => {
                        const confirmed = window.confirm(`Supprimer "${contact.name}" ?`);
                        if (confirmed) onDelete(contact.id);
                      }}
                    >
                      Supprimer
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="card form-card" style={{ position: "sticky", top: 20 }}>
          <p className="eyebrow">Nouveau</p>
          <h3>Ajouter un contact</h3>

          <form className="form-grid" onSubmit={onAdd}>
            <label>Nom<input name="name" placeholder="Nom ou société" /></label>
            <label>Type
              <select name="kind" defaultValue="Client">
                {contactKinds.map((kind) => <option key={kind}>{kind}</option>)}
              </select>
            </label>
            <label>Email<input name="email" type="email" placeholder="email@example.com" /></label>
            <label>Téléphone<input name="phone" placeholder="+33..." /></label>
            <label>Ville / zone<input name="city" placeholder="Cannes, Monaco..." /></label>
            <label>Budget<input name="budget" type="number" min="0" placeholder="Si client" /></label>
            <label>Source<input name="source" placeholder="Site, recommandation, réseau..." /></label>
            <label>Relation
              <select name="relationshipStatus" defaultValue="Prospect">
                {contactRelationshipStatuses.map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>

            <label>Service fournisseur
              <select name="supplierCategory" defaultValue="">
                <option value="">—</option>
                {supplierCategories.map((category) => <option key={category}>{category}</option>)}
              </select>
            </label>
            <label>Fiabilité
              <select name="supplierReliability" defaultValue="À tester">
                <option>À tester</option>
                <option>Fiable</option>
                <option>Très fiable</option>
                <option>À éviter</option>
              </select>
            </label>
            <label>Contact fournisseur<input name="supplierContactName" placeholder="Nom du contact" /></label>
            <label>Statut fournisseur
              <select name="supplierStatus" defaultValue="Actif">
                <option>Actif</option>
                <option>À vérifier</option>
                <option>Inactif</option>
              </select>
            </label>

            <label className="full">Notes prix / accord
              <textarea name="supplierPriceNotes" placeholder="Tarifs, minimum spend, conditions..." />
            </label>
            <label className="full">Notes
              <textarea name="notes" placeholder="Contexte, préférences, infos utiles" />
            </label>

            <button className="primary-button" type="submit">Ajouter</button>
          </form>
        </section>
      </div>

      {selectedContact && (
        <div className="confirm-backdrop">
          <div id="contact-detail-panel" className="confirm-dialog contact-detail-dialog" role="dialog" aria-modal="true">
            <p className="eyebrow">Fiche contact</p>
            <h3>{selectedContact.name}</h3>

            <div className="contact-detail-grid">
              <div><span>Type</span><strong>{typeLabel(selectedContact)}</strong></div>
              <div><span>Email</span><strong>{selectedContact.email || "Non renseigné"}</strong></div>
              <div><span>Téléphone</span><strong>{selectedContact.phone || "Non renseigné"}</strong></div>
              <div><span>Ville / zone</span><strong>{selectedContact.city || getContactSupplierZone(selectedContact) || "Non renseignée"}</strong></div>
              <div><span>Action</span><strong>{getActionMetaLabel(selectedContact)}</strong></div>

              {isSupplierContact(selectedContact) ? (
                <>
                  <div><span>Service</span><strong>{getContactSupplierCategory(selectedContact)}</strong></div>
                  <div><span>Fiabilité</span><strong>{selectedContact.supplierReliability || "À tester"}</strong></div>
                  <div><span>Qualité</span><strong>{selectedContact.supplierQuality || "Standard"}</strong></div>
                  <div><span>Statut</span><strong>{selectedContact.supplierStatus || "Actif"}</strong></div>
                  <div className="full"><span>Notes prix</span><p>{selectedContact.supplierPriceNotes || "Aucune note prix."}</p></div>
                  <div className="full"><span>Commission / marge</span><p>{selectedContact.supplierCommissionNotes || "Aucune note commission."}</p></div>
                </>
              ) : (
                <>
                  <div><span>Budget</span><strong>{selectedContact.budget ? currency.format(selectedContact.budget) : "Non renseigné"}</strong></div>
                  <div><span>Relation</span><strong>{getContactRelationshipStatus(selectedContact)}</strong></div>
                  <div><span>Niveau</span><strong>{getContactClientLevel(selectedContact)}</strong></div>
                  <div><span>Langue</span><strong>{getContactPreferredLanguage(selectedContact)}</strong></div>
                </>
              )}

              <div className="full"><span>Notes</span><p>{selectedContact.notes || "Aucune note."}</p></div>
            </div>

            {!isSupplierContact(selectedContact) && (
              <div className="contact-related-section">
                <p className="eyebrow">Synthèse commerciale</p>
                <div className="list-stack">
                  <article className="mini-row">
                    <div><strong>Leads liés</strong><span>{getContactLeads(selectedContact).length} lead{getContactLeads(selectedContact).length > 1 ? "s" : ""}</span></div>
                    <Badge>{getContactLeads(selectedContact).filter((lead) => lead.status !== "Perdu").length}</Badge>
                  </article>
                  <article className="mini-row">
                    <div><strong>Tâches ouvertes</strong><span>Actions restantes</span></div>
                    <Badge>{getContactTasks(selectedContact).filter((task) => task.status !== "Terminé").length}</Badge>
                  </article>
                </div>
              </div>
            )}

            <div className="confirm-actions">
              <button className="ghost-button" type="button" onClick={() => setSelectedContact(null)}>Fermer</button>
              {!isSupplierContact(selectedContact) && (
                <button className="secondary-button" type="button" onClick={() => { const name = selectedContact.name; setSelectedContact(null); onCreateLead(name); }}>Créer un lead</button>
              )}
              <button className="secondary-button" type="button" onClick={() => { const name = selectedContact.name; setSelectedContact(null); onCreateTask(name); }}>Créer une tâche</button>
              <button className="primary-button" type="button" onClick={() => openEdit(selectedContact)}>Modifier</button>
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
                  {contactKinds.map((kind) => <option key={kind}>{kind}</option>)}
                </select>
              </label>
              <label>Email<input name="email" type="email" defaultValue={editingContact.email} /></label>
              <label>Téléphone<input name="phone" defaultValue={editingContact.phone} /></label>
              <label>Ville / zone<input name="city" defaultValue={editingContact.city} /></label>
              <label>Budget<input name="budget" type="number" min="0" defaultValue={editingContact.budget || ""} /></label>
              <label>Source<input name="source" defaultValue={editingContact.source} /></label>
              <label>Relation
                <select name="relationshipStatus" defaultValue={getContactRelationshipStatus(editingContact)}>
                  {contactRelationshipStatuses.map((status) => <option key={status}>{status}</option>)}
                </select>
              </label>
              <label>Niveau client
                <select name="clientLevel" defaultValue={getContactClientLevel(editingContact)}>
                  {contactLevels.map((level) => <option key={level}>{level}</option>)}
                </select>
              </label>
              <label>Langue
                <select name="preferredLanguage" defaultValue={getContactPreferredLanguage(editingContact)}>
                  {contactLanguages.map((language) => <option key={language}>{language}</option>)}
                </select>
              </label>

              <label>Service fournisseur
                <select name="supplierCategory" defaultValue={editingContact.supplierCategory || ""}>
                  <option value="">—</option>
                  {supplierCategories.map((category) => <option key={category}>{category}</option>)}
                </select>
              </label>
              <label>Contact fournisseur<input name="supplierContactName" defaultValue={editingContact.supplierContactName || ""} /></label>
              <label>Fiabilité
                <select name="supplierReliability" defaultValue={editingContact.supplierReliability || "À tester"}>
                  <option>À tester</option>
                  <option>Fiable</option>
                  <option>Très fiable</option>
                  <option>À éviter</option>
                </select>
              </label>
              <label>Statut fournisseur
                <select name="supplierStatus" defaultValue={editingContact.supplierStatus || "Actif"}>
                  <option>Actif</option>
                  <option>À vérifier</option>
                  <option>Inactif</option>
                </select>
              </label>
              <label>Qualité
                <select name="supplierQuality" defaultValue={editingContact.supplierQuality || "Standard"}>
                  <option>Standard</option>
                  <option>Premium</option>
                  <option>Très premium</option>
                </select>
              </label>
              <label className="full">Notes prix
                <textarea name="supplierPriceNotes" defaultValue={editingContact.supplierPriceNotes || ""} />
              </label>
              <label className="full">Commission / marge
                <textarea name="supplierCommissionNotes" defaultValue={editingContact.supplierCommissionNotes || ""} />
              </label>
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
                <button className="ghost-button" type="button" onClick={() => setEditingContact(null)}>Annuler</button>
                <button className="primary-button" type="submit">Enregistrer</button>
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
  quotes = [],
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
  quotes?: QuoteRequest[];
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

    if (isOpenLead(updatedLead) && (!updatedLead.nextAction.trim() || !updatedLead.dueDate)) {
      window.alert("Un lead ouvert doit avoir une prochaine action et une échéance.");
      return;
    }

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
                    <article className={`lead-card ${getDueStatus(lead.dueDate)}`} key={lead.id} data-notification-target={`lead-${lead.id}`}>
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
                          {quotes.some((quote) => quote.leadId === lead.id) ? "Ouvrir devis lié" : "Créer devis"}
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
              <div><span>Action</span><strong>{getActionMetaLabel(selectedLead)}</strong></div>

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
              <ActionMeta item={property} />

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
              <ActionMeta item={vehicle} />

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
              <ActionMeta item={boat} />

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
          <div className="pipeline-grid task-pipeline-grid">
            {taskStatuses.map((status) => {
              const columnTasks = tasks.filter((task) => task.status === status);

              return (
                <div className="pipeline-column task-column" key={status}>
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
                          <article className="task-row" key={task.id} data-notification-target={`task-${task.id}`}>
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

                              <ActionMeta item={task} />

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
            <ActionMeta item={editingTask} />

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
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanEmail = email.trim();

    if (!cleanEmail) {
      setMessage("Renseigne ton email.");
      return;
    }

    if (!password) {
      setMessage("Renseigne ton mot de passe.");
      return;
    }

    setIsSubmitting(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password
    });

    setIsSubmitting(false);

    if (error) {
      setMessage(`Erreur connexion : ${error.message}`);
      return;
    }

    setMessage("Connexion réussie.");
  }

  return (
    <main className="crm-shell">
      <section className="card form-card">
        <p className="eyebrow">Accès sécurisé</p>
        <h1>Connexion CRM</h1>
        <p className="muted-line">
          Entre ton email et ton mot de passe autorisés pour accéder au CRM.
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

          <label className="full">Mot de passe
            <input
              type="password"
              value={password}
              placeholder="Mot de passe"
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Envoi..." : "Se connecter"}
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

    const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);

      if (event === "PASSWORD_RECOVERY") {
        window.setTimeout(async () => {
          const newPassword = window.prompt("Choisis ton nouveau mot de passe CRM :");

          if (!newPassword) {
            window.alert("Mot de passe non modifié.");
            return;
          }

          if (newPassword.length < 8) {
            window.alert("Le mot de passe doit contenir au moins 8 caractères.");
            return;
          }

          const { error } = await supabase.auth.updateUser({
            password: newPassword
          });

          if (error) {
            window.alert(`Mot de passe non modifié : ${error.message}`);
            return;
          }

          window.alert("Mot de passe CRM enregistré. Tu peux maintenant te connecter avec email + mot de passe.");
        }, 300);
      }
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

