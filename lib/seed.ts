import type { CRMData } from "./types";

export const seedData: CRMData = {
  contacts: [
    {
      id: "c-001",
      name: "Claire Moreau",
      kind: "Client",
      email: "claire.moreau@example.com",
      phone: "+33 6 12 34 56 78",
      city: "Cannes",
      postalAddress: "12 Boulevard de la Croisette, 06400 Cannes",
      budget: 2500000,
      source: "Recommandation",
      notes: "Recherche villa avec vue mer, 4 chambres minimum.",
      createdAt: "2026-05-12"
    },
    {
      id: "c-002",
      name: "Luca Ferri",
      kind: "Propriétaire",
      email: "luca.ferri@example.com",
      phone: "+39 333 111 22 33",
      city: "Saint-Jean-Cap-Ferrat",
      postalAddress: "8 Avenue Jean Mermoz, 06230 Saint-Jean-Cap-Ferrat",
      budget: 0,
      source: "Site web",
      notes: "Propriétaire d'une villa à valoriser en location saisonnière.",
      createdAt: "2026-05-18"
    },
    {
      id: "c-003",
      name: "Sophie Lambert",
      kind: "Partenaire",
      email: "sophie.lambert@example.com",
      phone: "+33 6 98 76 54 32",
      city: "Nice",
      postalAddress: "24 Rue Masséna, 06000 Nice",
      budget: 0,
      source: "Réseau",
      notes: "Architecte d'intérieur, peut aider sur les projets premium.",
      createdAt: "2026-05-20"
    }
  ],
  leads: [
    {
      id: "l-001",
      title: "Location villa été - Cannes",
      contactName: "Claire Moreau",
      status: "Visite",
      value: 180000,
      priority: "Haute",
      nextAction: "Envoyer 3 biens shortlistés",
      dueDate: "2026-06-05"
    },
    {
      id: "l-002",
      title: "Mandat gestion villa Cap-Ferrat",
      contactName: "Luca Ferri",
      status: "Négociation",
      value: 95000,
      priority: "Haute",
      nextAction: "Préparer proposition de mandat",
      dueDate: "2026-06-04"
    },
    {
      id: "l-003",
      title: "Conciergerie événement privé",
      contactName: "Sophie Lambert",
      status: "Contacté",
      value: 22000,
      priority: "Moyenne",
      nextAction: "Planifier appel découverte",
      dueDate: "2026-06-07"
    }
  ],
  properties: [
    {
      id: "p-001",
      name: "Villa Azur",
      city: "Cannes",
      type: "Villa",
      price: 120000,
      status: "Disponible",
      owner: "Luca Ferri",
      bedrooms: 5,
      surface: 420
    },
    {
      id: "p-002",
      name: "Penthouse Croisette",
      city: "Cannes",
      type: "Appartement",
      price: 45000,
      status: "Mandat en cours",
      owner: "Privé",
      bedrooms: 3,
      surface: 180
    },
    {
      id: "p-003",
      name: "Domaine des Pins",
      city: "Mougins",
      type: "Domaine",
      price: 90000,
      status: "Disponible",
      owner: "Confidentiel",
      bedrooms: 7,
      surface: 680
    }
  ],
  tasks: [
    {
      id: "t-001",
      title: "Relancer Claire avec sélection de villas",
      owner: "Matteo",
      status: "À faire",
      dueDate: "2026-06-05",
      linkedTo: "Location villa été - Cannes"
    },
    {
      id: "t-002",
      title: "Finaliser proposition mandat Cap-Ferrat",
      owner: "Matteo",
      status: "En cours",
      dueDate: "2026-06-04",
      linkedTo: "Mandat gestion villa Cap-Ferrat"
    },
    {
      id: "t-003",
      title: "Mettre à jour fiche Villa Azur",
      owner: "Admin",
      status: "À faire",
      dueDate: "2026-06-08",
      linkedTo: "Villa Azur"
    }
  ]
};
