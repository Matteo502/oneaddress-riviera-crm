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
const leadStatuses: LeadStatus[] = ["Nouveau", "Contacté", "Visite", "Négociation", "Gagné", "Perdu"];
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

export default function CRMApp() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<CRMData>(seedData);
  const [toast, setToast] = useState<Toast | null>(null);

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
    return data.tasks.filter((task) => searchMatch(query, [task.title, task.owner, task.status, task.linkedTo]));
  }, [data.tasks, query]);

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

    const lead: Lead = {
      id: makeId("l"),
      category: String(form.get("category") ?? "Villa") as Lead["category"],
      contactName: String(form.get("contactName") ?? "").trim(),
      status: String(form.get("status") ?? "Nouveau") as LeadStatus,
      value: safeNumber(form.get("value")),
      priority: String(form.get("priority") ?? "Moyenne") as Lead["priority"],
      nextAction: String(form.get("nextAction") ?? "").trim(),
      dueDate: String(form.get("dueDate") ?? ""),
      rentalStartDate: String(form.get("rentalStartDate") ?? ""),
      rentalEndDate: String(form.get("rentalEndDate") ?? "")
    };

    if (!lead.contactName) return notify("Sélectionnez un contact pour ce lead.", "warning");

    setData((current) => ({ ...current, leads: [lead, ...current.leads] }));
    event.currentTarget.reset();
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
    notify("Tâche ajoutée.");
  }

  function updateLeadStatus(id: string, status: LeadStatus) {
    setData((current) => ({
      ...current,
      leads: current.leads.map((lead) => (lead.id === id ? { ...lead, status } : lead))
    }));
  }

  function updateTaskStatus(id: string, status: TaskStatus) {
    setData((current) => ({
      ...current,
      tasks: current.tasks.map((task) => (task.id === id ? { ...task, status } : task))
    }));
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
          <ContactsView contacts={filteredContacts} onAdd={addContact} onDelete={deleteContact} />
        )}

        {activeTab === "leads" && (
          <LeadsView leads={filteredLeads} contacts={data.contacts} onAdd={addLead} onStatusChange={updateLeadStatus} onDelete={deleteLead} />
        )}

        {activeTab === "properties" && (
          <PropertiesView properties={filteredProperties} onAdd={addProperty} onDelete={deleteProperty} />
        )}

        {activeTab === "vehicles" && (
          <VehiclesView vehicles={filteredVehicles} onAdd={addVehicle} onDelete={deleteVehicle} />
        )}

        {activeTab === "boats" && (
          <BoatsView boats={filteredBoats} onAdd={addBoat} onDelete={deleteBoat} />
        )}

        {activeTab === "tasks" && (
          <TasksView tasks={filteredTasks} onAdd={addTask} onStatusChange={updateTaskStatus} onDelete={deleteTask} />
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

function ContactsView({ contacts, onAdd, onDelete }: { contacts: Contact[]; onAdd: (event: React.FormEvent<HTMLFormElement>) => void; onDelete: (id: string) => void }) {
  return (
    <div className="two-columns wide-left">
      <section className="card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Base client</p>
            <h3>{contacts.length} contacts</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nom</th>
                <th>Type</th>
                <th>Ville / adresse</th>
                <th>Budget</th>
                <th>Contact</th>
                <th></th>
                            <th>Actions</th>
            </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr key={contact.id}>
                  <td>
                    <strong>{contact.name}</strong>
                    <small>{contact.source}</small>
                  </td>
                  <td><Badge>{contact.kind}</Badge></td>
                  <td>
                    <span className="muted-line">{contact.city || "—"}</span>
                    <span className="muted-line">{contact.postalAddress || "Adresse non renseignée"}</span>
                  </td>
                  <td>{contact.budget > 0 ? currency.format(contact.budget) : "—"}</td>
                  <td>
                    <span className="muted-line">{contact.email}</span>
                    <span className="muted-line">{contact.phone}</span>
                  </td>
                  <td><button className="icon-button" onClick={() => onDelete(contact.id)} aria-label="Supprimer">×</button></td>
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
          <label>Type<select name="kind">{contactKinds.map((kind) => <option key={kind}>{kind}</option>)}</select></label>
          <label>Email<input name="email" type="email" placeholder="email@exemple.com" /></label>
          <label>Téléphone<input name="phone" placeholder="+33..." /></label>
          <label>Ville<input name="city" placeholder="Cannes" /></label>
          <label>Adresse postale<input name="postalAddress" placeholder="12 Boulevard de la Croisette, 06400 Cannes" /></label>
          <label>Budget<input name="budget" type="number" min="0" placeholder="2500000" /></label>
          <label>Source<input name="source" placeholder="Site web, recommandation..." /></label>
          <label className="full">Notes<textarea name="notes" placeholder="Besoins, contexte, prochaines infos à retenir" /></label>
          <button className="primary-button" type="submit">Ajouter</button>
        </form>
      </section>
    </div>
  );
}

function LeadsView({
  leads,
  contacts,
  onAdd,
  onStatusChange,
  onDelete
}: {
  leads: Lead[];
  contacts: Contact[];
  onAdd: (event: React.FormEvent<HTMLFormElement>) => void;
  onStatusChange: (id: string, status: LeadStatus) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="stack">
      <section className="card form-card horizontal-form">
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
            <select name="contactName" required>
              <option value="">Sélectionner un contact</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.name}>
                  {contact.name}
                </option>
              ))}
            </select>
          </label>

          <label>Statut<select name="status">{leadStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
          <label>Valeur<input name="value" type="number" min="0" placeholder="180000" /></label>
          <label>Priorité<select name="priority"><option>Basse</option><option>Moyenne</option><option>Haute</option></select></label>
          <label>Échéance<input name="dueDate" type="date" /></label>
          <label>Début réservation<input name="rentalStartDate" type="date" /></label>
          <label>Fin réservation<input name="rentalEndDate" type="date" /></label>
          <label className="full">Prochaine action<input name="nextAction" placeholder="Appeler, envoyer proposition..." /></label>
          <button className="primary-button" type="submit">Ajouter</button>
        </form>
      </section>

      <section className="pipeline-grid">
        {leadStatuses.map((status) => {
          const columnLeads = leads.filter((lead) => lead.status === status);
          return (
            <div className="pipeline-column" key={status}>
              <div className="pipeline-title">
                <strong>{status}</strong>
                <span>{columnLeads.length}</span>
              </div>
              <div className="list-stack">
                {columnLeads.map((lead) => (
                  <article className="lead-card" key={lead.id}>
                    <div className="lead-topline">
                      <Badge>{lead.priority}</Badge>
                      <button className="icon-button" onClick={() => onDelete(lead.id)} aria-label="Supprimer">×</button>
                    </div>
                    <strong>{lead.category}</strong>
                    <span>{lead.contactName}</span>
                    <small>{formatReservationPeriod(lead.rentalStartDate, lead.rentalEndDate)}</small>
                    <p>{lead.nextAction || "Aucune prochaine action"}</p>
                    <div className="lead-footer">
                      <b>{currency.format(lead.value)}</b>
                      <small>{lead.dueDate ? `Échéance réponse ${formatDateFR(lead.dueDate)}` : "Échéance réponse non renseignée"}</small>
                    </div>
                    <select value={lead.status} onChange={(event) => onStatusChange(lead.id, event.target.value as LeadStatus)}>
                      {leadStatuses.map((option) => <option key={option}>{option}</option>)}
                    </select>
                  </article>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}


function PropertiesView({ properties, onAdd, onDelete }: { properties: Property[]; onAdd: (event: React.FormEvent<HTMLFormElement>) => void; onDelete: (id: string) => void }) {
  return (
    <div className="two-columns wide-left">
      <section className="property-grid">
        {properties.map((property) => (
          <article className="property-card" key={property.id}>
            <div className="property-visual">
              <span>{property.type}</span>
              <button className="icon-button light" onClick={() => onDelete(property.id)} aria-label="Supprimer">×</button>
            </div>
            <div className="property-body">
              <div className="section-heading compact-heading">
                <div>
                  <h3>{property.name}</h3>
                  <p>{property.city}</p>
                </div>
                <Badge>{property.status}</Badge>
              </div>
              <dl className="property-meta">
                <div><dt>Prix</dt><dd>{currency.format(property.price)}</dd></div>
                <div><dt>Chambres</dt><dd>{property.bedrooms}</dd></div>
                <div><dt>Surface</dt><dd>{property.surface} m²</dd></div>
                <div><dt>Owner</dt><dd>{property.owner || "—"}</dd></div>
              </dl>
            </div>
          </article>
        ))}
      </section>

      <section className="card form-card">
        <p className="eyebrow">Nouveau</p>
        <h3>Ajouter un bien</h3>
        <form className="form-grid" onSubmit={onAdd}>
          <label>Nom<input name="name" placeholder="Villa Azur" /></label>
          <label>Ville<input name="city" placeholder="Cannes" /></label>
          <label>Type<input name="type" placeholder="Villa, appartement..." /></label>
          <label>Prix<input name="price" type="number" min="0" placeholder="120000" /></label>
          <label>Statut<select name="status">{propertyStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
          <label>Propriétaire<input name="owner" placeholder="Nom owner" /></label>
          <label>Chambres<input name="bedrooms" type="number" min="0" /></label>
          <label>Surface m²<input name="surface" type="number" min="0" /></label>
          <button className="primary-button" type="submit">Ajouter</button>
        </form>
      </section>
    </div>
  );
}



function VehiclesView({
  vehicles,
  onAdd,
  onDelete
}: {
  vehicles: Vehicle[];
  onAdd: (event: React.FormEvent<HTMLFormElement>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="two-columns wide-left">
      <section className="property-grid">
        {vehicles.length === 0 && (
          <div className="empty-state">
            <h3>Aucune voiture pour le moment</h3>
            <p>Ajoutez une voiture avec le formulaire à droite.</p>
          </div>
        )}

        {vehicles.map((vehicle) => (
          <article className="property-card" key={vehicle.id}>
            <div className="property-visual">
              <span>{vehicle.brand || "Voiture"}</span>
              <button className="icon-button light" onClick={() => onDelete(vehicle.id)} aria-label="Supprimer">×</button>
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
                <div>
                  <dt>Prix / jour</dt>
                  <dd>{currency.format(vehicle.price)}</dd>
                </div>
                <div>
                  <dt>Année</dt>
                  <dd>{vehicle.year || "—"}</dd>
                </div>
                <div>
                  <dt>Kilométrage</dt>
                  <dd>{vehicle.mileage ? `${vehicle.mileage.toLocaleString("fr-FR")} km` : "—"}</dd>
                </div>
                <div>
                  <dt>Owner</dt>
                  <dd>{vehicle.owner || "—"}</dd>
                </div>
              </dl>
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
    </div>
  );
}

function BoatsView({
  boats,
  onAdd,
  onDelete
}: {
  boats: Boat[];
  onAdd: (event: React.FormEvent<HTMLFormElement>) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="two-columns wide-left">
      <section className="property-grid">
        {boats.length === 0 && (
          <div className="empty-state">
            <h3>Aucun bateau pour le moment</h3>
            <p>Ajoutez un bateau avec le formulaire à droite.</p>
          </div>
        )}

        {boats.map((boat) => (
          <article className="property-card" key={boat.id}>
            <div className="property-visual">
              <span>{boat.type || "Bateau"}</span>
              <button className="icon-button light" onClick={() => onDelete(boat.id)} aria-label="Supprimer">×</button>
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
                <div>
                  <dt>Prix / jour</dt>
                  <dd>{currency.format(boat.price)}</dd>
                </div>
                <div>
                  <dt>Longueur</dt>
                  <dd>{boat.length ? `${boat.length} m` : "—"}</dd>
                </div>
                <div>
                  <dt>Année</dt>
                  <dd>{boat.year || "—"}</dd>
                </div>
                <div>
                  <dt>Owner</dt>
                  <dd>{boat.owner || "—"}</dd>
                </div>
              </dl>
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
    </div>
  );
}


function TasksView({
  tasks,
  onAdd,
  onStatusChange,
  onDelete
}: {
  tasks: Task[];
  onAdd: (event: React.FormEvent<HTMLFormElement>) => void;
  onStatusChange: (id: string, status: TaskStatus) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="two-columns wide-left">
      <section className="card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Actions</p>
            <h3>{tasks.length} tâches</h3>
          </div>
        </div>
        <div className="list-stack">
          {tasks.map((task) => (
            <article className={`task-row ${task.status === "Terminé" ? "done" : ""}`} key={task.id}>
              <div>
                <strong>{task.title}</strong>
                <span>{task.owner} · {task.linkedTo || "Non lié"} · {task.dueDate || "Sans date"}</span>
              </div>
              <div className="row-actions">
                <select value={task.status} onChange={(event) => onStatusChange(task.id, event.target.value as TaskStatus)}>
                  {taskStatuses.map((status) => <option key={status}>{status}</option>)}
                </select>
                <button className="icon-button" onClick={() => onDelete(task.id)} aria-label="Supprimer">×</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="card form-card">
        <p className="eyebrow">Nouveau</p>
        <h3>Ajouter une tâche</h3>
        <form className="form-grid" onSubmit={onAdd}>
          <label>Catégorie
            <select name="category" defaultValue="Villa">
              <option value="Villa">Villa</option>
              <option value="Voiture">Voiture</option>
              <option value="Bateau">Bateau</option>
              <option value="Conciergerie">Conciergerie</option>
            </select>
          </label>
          <label>Responsable<input name="owner" placeholder="Matteo" defaultValue="Matteo" /></label>
          <label>Statut<select name="status">{taskStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
          <label>Échéance<input name="dueDate" type="date" /></label>
          <label className="full">Lié à<input name="linkedTo" placeholder="Lead, bien, contact..." /></label>
          <button className="primary-button" type="submit">Ajouter</button>
        </form>
      </section>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="badge">{children}</span>;
}
