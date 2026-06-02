export type ContactKind = "Client" | "Propriétaire" | "Partenaire";
export type LeadStatus = "Nouveau" | "Contacté" | "Devis" | "Négociation" | "Gagné" | "Perdu";
export type PropertyStatus = "Disponible" | "Mandat en cours" | "Loué" | "Vendu";
export type VehicleStatus = "Disponible" | "En location" | "En maintenance" | "Vendu";
export type BoatStatus = "Disponible" | "En charter" | "En maintenance" | "Vendu";
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
  category: "Villa" | "Voiture" | "Bateau" | "Conciergerie";
  contactName: string;
  status: LeadStatus;
  value: number;
  priority: "Basse" | "Moyenne" | "Haute";
  nextAction: string;
  dueDate: string;
  rentalStartDate: string;
  rentalEndDate: string;
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

export type Vehicle = {
  id: string;
  name: string;
  brand: string;
  model: string;
  city: string;
  price: number;
  status: VehicleStatus;
  owner: string;
  year: number;
  mileage: number;
};

export type Boat = {
  id: string;
  name: string;
  port: string;
  type: string;
  price: number;
  status: BoatStatus;
  owner: string;
  year: number;
  length: number;
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
  vehicles: Vehicle[];
  boats: Boat[];
  tasks: Task[];
};
