"use client";

import { useEffect, useMemo, useState } from "react";
import { seedData } from "@/lib/seed";
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
const leadStatuses: LeadStatus[] = ["Nouveau", "Contacté", "Devis", "Négociation", "Gagné", "Perdu"];
const propertyStatuses: PropertyStatus[] = ["Disponible", "Mandat en cours", "Loué", "Vendu"];
const vehicleStatuses: VehicleStatus[] = ["Disponible", "En location", "En maintenance", "Vendu"];
const boatStatuses: BoatStatus[] = ["Disponible", "En charter", "En maintenance", "Vendu"];
const taskStatuses: TaskStatus[] = ["À faire", "En cours", "Terminé"];
const contactKinds: ContactKind[] = ["Client", "Propriétaire", "Partenaire"];

type Tab = "dashboard" | "contacts" | "leads" | "properties" | "vehicles" | "boats" | "tasks";

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
      headers: ["Nom", "Type", "Email", "Téléphone", "Ville", "Adresse postale", "Budget", "Source", "Notes"],
      rows: data.contacts.map((contact) => [
        contact.name,
        contact.kind,
        contact.email,
        contact.phone,
        contact.city,
        contact.postalAddress,
        contact.budget,
        contact.source,
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

export default function CRMApp() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [leadDraftContactName, setLeadDraftContactName] = useState("");
  const [taskDraftLeadId, setTaskDraftLeadId] = useState("");
  const [taskDraftTitle, setTaskDraftTitle] = useState("");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<CRMData>(seedData);
  const [toast, setToast] = useState<Toast | null>(null);

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
          ...seedData,
          ...parsed,
          contacts: parsed.contacts ?? seedData.contacts,
          leads: parsed.leads ?? seedData.leads,
          properties: parsed.properties ?? seedData.properties,
          vehicles: parsed.vehicles ?? seedData.vehicles,
          boats: parsed.boats ?? seedData.boats,
          tasks: parsed.tasks ?? seedData.tasks
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
    function handleExportCsv() {
    exportCRMAsCsv(data);
    notify("Export CSV téléchargé.");
  }

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
    return data.tasks.filter((task) => {
      const linkedLead = data.leads.find((lead) => lead.id === task.linkedTo);
      const linkedLeadLabel = linkedLead ? `${linkedLead.category} ${linkedLead.contactName}` : task.linkedTo;

      return searchMatch(query, [task.title, task.owner, task.status, linkedLeadLabel]);
    });
  }, [data.tasks, data.leads, query]);

  function notify(message: string, tone: Toast["tone"] = "success") {
    setToast({ message, tone });
  }

  function resetDemo() {
    setData(seedData);
    notify("Données de démonstration restaurées.");
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
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
      createdAt: new Date().toISOString().slice(0, 10)
    };
    if (!contact.name) return notify("Ajoutez au minimum un nom de contact.", "warning");
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
    setData((current) => ({ ...current, properties: current.properties.filter((property) => property.id !== id) }));
    notify("Bien supprimé.");
  }

  function deleteVehicle(id: string) {
    setData((current) => ({ ...current, vehicles: (current.vehicles ?? []).filter((vehicle) => vehicle.id !== id) }));
    notify("Voiture supprimée.");
  }

  function deleteBoat(id: string) {
    setData((current) => ({ ...current, boats: (current.boats ?? []).filter((boat) => boat.id !== id) }));
    notify("Bateau supprimé.");
  }

  function deleteTask(id: string) {
    setData((current) => ({ ...current, tasks: current.tasks.filter((task) => task.id !== id) }));
    notify("Tâche supprimée.");
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
          <NavButton label="Dashboard" icon="◆" active={activeTab === "dashboard"} onClick={() => setActiveTab("dashboard")} />
          <NavButton label="Contacts" icon="◎" active={activeTab === "contacts"} onClick={() => setActiveTab("contacts")} />
          <NavButton label="Leads" icon="▣" active={activeTab === "leads"} onClick={() => setActiveTab("leads")} />
          <NavButton label="Biens" icon="⌂" active={activeTab === "properties"} onClick={() => setActiveTab("properties")} />
          <NavButton label="Voitures" icon="◇" active={activeTab === "vehicles"} onClick={() => setActiveTab("vehicles")} />
          <NavButton label="Bateaux" icon="≈" active={activeTab === "boats"} onClick={() => setActiveTab("boats")} />
          <NavButton label="Tâches" icon="✓" active={activeTab === "tasks"} onClick={() => setActiveTab("tasks")} />
        </nav>

        <div className="sidebar-card">
          <p className="eyebrow">MVP</p>
          <strong>Données locales</strong>
          <span>Cette version garde les données dans le navigateur. Prêt à connecter une DB ensuite.</span>
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
            <button className="secondary-button" onClick={exportJson}>Exporter</button>
            <button className="secondary-button" onClick={() => {
            exportCRMAsCsv(data);
            notify("Export CSV téléchargé.");
          }}>Exporter CSV</button>
          <button className="ghost-button" onClick={resetDemo}>Reset démo</button>
          </div>
        </header>

        {activeTab === "dashboard" && (
          <Dashboard
            stats={stats}
            data={data}
            onLeadStatusChange={updateLeadStatus}
            onTaskStatusChange={updateTaskStatus}
          />
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
                }} />
        )}

        {activeTab === "leads" && (
          <LeadsView leads={filteredLeads} contacts={data.contacts} tasks={data.tasks} properties={data.properties} vehicles={data.vehicles ?? []} boats={data.boats ?? []} preselectedContactName={leadDraftContactName} onAdd={addLead} onUpdate={updateLead} onStatusChange={updateLeadStatus} onDelete={deleteLead} onCreateTask={(lead: Lead) => {
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
          <PropertiesView properties={filteredProperties} onAdd={addProperty} onUpdate={updateProperty} onDelete={deleteProperty} />
        )}

        {activeTab === "vehicles" && (
          <VehiclesView vehicles={filteredVehicles} onAdd={addVehicle} onUpdate={updateVehicle} onDelete={deleteVehicle} />
        )}

        {activeTab === "boats" && (
          <BoatsView boats={filteredBoats} onAdd={addBoat} onUpdate={updateBoat} onDelete={deleteBoat} />
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
    properties: "Biens & mandats",
    vehicles: "Voitures",
    boats: "Bateaux",
    tasks: "Tâches"
  };
  return titles[tab];
}

function searchMatch(query: string, fields: Array<string | number>) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((field) => String(field).toLowerCase().includes(needle));
}

function Dashboard({
  stats,
  data,
  onLeadStatusChange,
  onTaskStatusChange
}: {
  stats: { pipeline: number; won: number; openTasks: number; availableProperties: number };
  data: CRMData;
  onLeadStatusChange: (id: string, status: LeadStatus) => void;
  onTaskStatusChange: (id: string, status: TaskStatus) => void;
}) {
  const nextTasks = [...data.tasks].filter((task) => task.status !== "Terminé").sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const hotLeads = [...data.leads].filter((lead) => lead.status !== "Perdu").sort((a, b) => b.value - a.value).slice(0, 4);

  return (
    <div className="stack">
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
  onCreateLead
}: {
  contacts: Contact[];
  leads: Lead[];
  tasks: Task[];
  onAdd: (event: React.FormEvent<HTMLFormElement>) => void;
  onUpdate: (contact: Contact) => void;
  onDelete: (id: string) => void;
  onCreateLead: (contactName: string) => void;
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
      notes: String(form.get("notes") ?? "").trim()
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
              {contacts.map((contact) => (
                <tr key={contact.id}>
                  <td>
                    <strong>{contact.name}</strong>
                    <small>{contact.source || "Source non renseignée"}</small>

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

          <label>Email<input name="email" type="email" placeholder="email@example.com" /></label>
          <label>Téléphone<input name="phone" placeholder="+33..." /></label>
          <label>Ville<input name="city" placeholder="Cannes" /></label>
          <label>Adresse postale<input name="postalAddress" placeholder="12 Boulevard de la Croisette, 06400 Cannes" /></label>
          <label>Budget<input name="budget" type="number" min="0" placeholder="2500000" /></label>
          <label>Source<input name="source" placeholder="Site web, recommandation..." /></label>

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
                <span>Notes client</span>
                <p>{selectedContact.notes || "Aucune note pour ce contact."}</p>
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

              <label>Email<input name="email" type="email" defaultValue={editingContact.email} /></label>
              <label>Téléphone<input name="phone" defaultValue={editingContact.phone} /></label>
              <label>Ville<input name="city" defaultValue={editingContact.city} /></label>
              <label>Adresse postale<input name="postalAddress" defaultValue={editingContact.postalAddress} /></label>
              <label>Budget<input name="budget" type="number" min="0" defaultValue={editingContact.budget || ""} /></label>
              <label>Source<input name="source" defaultValue={editingContact.source} /></label>

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
    const statusMatches = leadStatusFilter === "Tous" || lead.status === leadStatusFilter;
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

  return (
    <div className="stack">
      <section id="lead-create-form" className="card form-card horizontal-form">
        <div>
          <p className="eyebrow">Nouveau</p>
          <h3>Ajouter un lead</h3>
        </div>

        <form className="form-grid compact" onSubmit={onAdd}>
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

          <label>Statut
            <select name="status">
              {leadStatuses.map((status) => <option key={status}>{status}</option>)}
            </select>
          </label>

          <label>Valeur<input name="value" type="number" min="0" placeholder="180000" /></label>

          <label>Priorité
            <select name="priority">
              <option>Basse</option>
              <option>Moyenne</option>
              <option>Haute</option>
            </select>
          </label>

          <label>Échéance<input name="dueDate" type="date" /></label>
          <label>Début réservation<input name="rentalStartDate" type="date" /></label>
          <label>Fin réservation<input name="rentalEndDate" type="date" /></label>

          <label className="full">Prochaine action
            <input name="nextAction" placeholder="Appeler, envoyer proposition..." />
          </label>

          <label className="full">Notes internes
            <textarea name="notes" placeholder="Préférences client, contraintes, détails importants..." />
          </label>

          <button className="primary-button" type="submit">Ajouter</button>
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

          <button
            className="ghost-button"
            type="button"
            disabled={!filtersAreActive}
            onClick={() => {
              setLeadCategoryFilter("Toutes");
              setLeadStatusFilter("Tous");
              setLeadPriorityFilter("Toutes");
              setLeadDueFilter("Tous");
              setLeadActionFilter("Tous");
            }}
          >
            Réinitialiser
          </button>
        </div>
      </section>

      <section className="pipeline-grid">
        {leadStatuses.map((status) => {
          const columnLeads = sortByUrgency(visibleLeads.filter((lead) => lead.status === status));

          return (
            <div className="pipeline-column" key={status}>
              <div className="pipeline-title">
                <strong>{status}</strong>
                <span>{columnLeads.length}</span>
              </div>

              <div className="list-stack">
                {columnLeads.map((lead) => (
                  <article className={`lead-card ${getDueStatus(lead.dueDate)}`} key={lead.id}>
                    <div className="lead-topline">
                      <Badge>{lead.priority}</Badge>

                      <button
                        className="icon-button"
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
                      <button
                        className="lead-detail-button"
                        type="button"
                        onClick={() => setSelectedLead(lead)}
                      >
                        Détails
                      </button>

                      <button
                        className="lead-detail-button"
                        type="button"
                        onClick={() => onCreateTask(lead)}
                      >
                        Tâche
                      </button>

                      <button
                        className="lead-edit-button"
                        type="button"
                        onClick={() => openEdit(lead)}
                      >
                        Modifier
                      </button>
                    </div>
                  </article>
                ))}
              </div>
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
  onAdd,
  onUpdate,
  onDelete
}: {
  properties: Property[];
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

            <button className="ghost-button" type="button" onClick={() => {
              setPropertyStatusFilter("Tous");
              setPropertyCityFilter("");
            }}>
              Réinitialiser
            </button>
          </div>
        </div>

        {visibleProperties.length === 0 && (
          <div className="empty-state">
            <h3>Aucun bien trouvé</h3>
            <p>Modifiez vos filtres pour afficher plus de résultats.</p>
          </div>
        )}

        {visibleProperties.map((property) => (
          <article className="property-card" key={property.id}>
            <div className="property-visual">
              <span>{property.city || "Bien"}</span>

              <button
                className="icon-button light"
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
  onAdd,
  onUpdate,
  onDelete
}: {
  vehicles: Vehicle[];
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

            <button className="ghost-button" type="button" onClick={() => {
              setVehicleStatusFilter("Tous");
              setVehicleCityFilter("");
            }}>
              Réinitialiser
            </button>
          </div>
        </div>

        {visibleVehicles.length === 0 && (
          <div className="empty-state">
            <h3>Aucune voiture trouvée</h3>
            <p>Modifiez vos filtres pour afficher plus de résultats.</p>
          </div>
        )}

        {visibleVehicles.map((vehicle) => (
          <article className="property-card" key={vehicle.id}>
            <div className="property-visual">
              <span>{vehicle.brand || "Voiture"}</span>
              <button className="icon-button light" onClick={() => {
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
  onAdd,
  onUpdate,
  onDelete
}: {
  boats: Boat[];
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

            <button className="ghost-button" type="button" onClick={() => {
              setBoatStatusFilter("Tous");
              setBoatPortFilter("");
            }}>
              Réinitialiser
            </button>
          </div>
        </div>

        {visibleBoats.length === 0 && (
          <div className="empty-state">
            <h3>Aucun bateau trouvé</h3>
            <p>Modifiez vos filtres pour afficher plus de résultats.</p>
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
            <h3>{tasks.length} tâches</h3>
          </div>
        </div>

        <div className="list-stack">
          {tasks.length === 0 && (
            <div className="empty-state">
              <h3>Aucune tâche pour le moment</h3>
              <p>Ajoutez une tâche avec le formulaire à droite.</p>
            </div>
          )}

          {tasks.map((task) => (
            <article
              className={`task-row ${task.status === "Terminé" ? "done" : ""}`}
              key={task.id}
            >
              <div>
                <strong>{task.title}</strong>
                <span>{getLinkedLeadLabel(task.linkedTo)}</span>
                <small>
                  {task.owner || "Responsable non renseigné"} • <span className={`due-label ${getDueStatus(task.dueDate)}`}>{getDueLabel(task.dueDate)}</span>
                </small>

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
                  {taskStatuses.map((status) => <option key={status}>{status}</option>)}
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
          ))}
        </div>
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
