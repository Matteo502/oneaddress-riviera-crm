export type ContactKind = "Client" | "Propriétaire" | "Partenaire";
export type ContactLevel = "Standard" | "VIP" | "Ultra VIP";
export type ContactLanguage = "Français" | "Anglais" | "Italien" | "Autre";
export type ContactRelationshipStatus = "Prospect" | "Actif" | "Dormant";
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
  clientLevel?: ContactLevel;
  preferredLanguage?: ContactLanguage;
  relationshipStatus?: ContactRelationshipStatus;
  preferences?: string;
  importantNotes?: string;
  createdAt: string;
};

export type Lead = {
  id: string;
  category: "Villa" | "Voiture" | "Bateau" | "Conciergerie";
  contactName: string;
  assetType?: "" | "Property" | "Vehicle" | "Boat";
  assetId?: string;
  status: LeadStatus;
  value: number;
  priority: "Basse" | "Moyenne" | "Haute";
  nextAction: string;
  notes: string;
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
  notes?: string;
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
  notes?: string;
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
  notes?: string;
};


export type Task = {
  id: string;
  title: string;
  owner: string;
  status: TaskStatus;
  dueDate: string;
  linkedTo: string;
};


export type Supplier = {
  id: string;
  name: string;
  category: "Villa" | "Voiture" | "Bateau" | "Chauffeur" | "Chef" | "Sécurité" | "Conciergerie" | "Paysagiste" | "Gestion nuisibles" | "Pisciniste" | "Femme de ménage" | "Nounou" | "Artisan rénovation" | "Lavage voiture" | "Garage / mécanicien" | "Jardinier" | "Autre";
  contactName: string;
  email: string;
  phone: string;
  zone: string;
  quality: "Standard" | "Premium" | "Très premium";
  reliability: "À tester" | "Fiable" | "Très fiable" | "À éviter";
  priceNotes: string;
  commissionNotes: string;
  notes: string;
  status: "Actif" | "À vérifier" | "Inactif";
  createdAt: string;
};

export type CRMData = {
  contacts: Contact[];
  leads: Lead[];
  properties: Property[];
  vehicles: Vehicle[];
  boats: Boat[];
  tasks: Task[];
  suppliers?: Supplier[];
  quotes?: any[];
};
