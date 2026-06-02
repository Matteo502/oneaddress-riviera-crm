export type ContactKind = "Client" | "Propriétaire" | "Partenaire";
export type LeadStatus = "Nouveau" | "Contacté" | "Visite" | "Négociation" | "Gagné" | "Perdu";
export type PropertyStatus = "Disponible" | "Mandat en cours" | "Loué" | "Vendu";
export type TaskStatus = "À faire" | "En cours" | "Terminé";

export type Contact = {
  id: string;
  name: string;
  kind: ContactKind;
  email: string;
  phone: string;
  city: string;
  postalAddress: string;
  budget: number;
  source: string;
  notes: string;
  createdAt: string;
};

export type Lead = {
  id: string;
  title: string;
  contactName: string;
  status: LeadStatus;
  value: number;
  priority: "Basse" | "Moyenne" | "Haute";
  nextAction: string;
  dueDate: string;
};

export type Property = {
  id: string;
  name: string;
  city: string;
  type: string;
  price: number;
  status: PropertyStatus;
  owner: string;
  bedrooms: number;
  surface: number;
};

export type Task = {
  id: string;
  title: string;
  owner: string;
  status: TaskStatus;
  dueDate: string;
  linkedTo: string;
};

export type CRMData = {
  contacts: Contact[];
  leads: Lead[];
  properties: Property[];
  tasks: Task[];
};
