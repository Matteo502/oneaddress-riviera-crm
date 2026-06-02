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
      category: "Villa",
      contactName: "Claire Moreau",
      status: "Visite",
      value: 180000,
      priority: "Haute",
      nextAction: "Envoyer 3 biens shortlistés",
      dueDate: "2026-06-05"
    },
    {
      id: "l-002",
      category: "Villa",
      contactName: "Luca Ferri",
      status: "Négociation",
      value: 95000,
      priority: "Haute",
      nextAction: "Préparer proposition de mandat",
      dueDate: "2026-06-04"
    },
    {
      id: "l-003",
      category: "Villa",
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
  vehicles: [
    {
      id: "v-001",
      name: "Range Rover Autobiography",
      brand: "Land Rover",
      model: "Range Rover Autobiography",
      city: "Cannes",
      price: 900,
      status: "Disponible",
      owner: "OneAddress Riviera",
      year: 2024,
      mileage: 12000
    },
    {
      id: "v-002",
      name: "Mercedes Classe V",
      brand: "Mercedes-Benz",
      model: "Classe V",
      city: "Nice",
      price: 650,
      status: "En location",
      owner: "Partenaire chauffeur",
      year: 2023,
      mileage: 28000
    },
    {
      id: "v-003",
      name: "Porsche 911 Carrera Cabriolet",
      brand: "Porsche",
      model: "911 Carrera Cabriolet",
      city: "Monaco",
      price: 1200,
      status: "Disponible",
      owner: "Privé",
      year: 2022,
      mileage: 18000
    }
  ],
  boats: [
    {
      id: "b-001",
      name: "Sunseeker Manhattan 55",
      port: "Cannes",
      type: "Yacht",
      price: 4500,
      status: "Disponible",
      owner: "Partenaire nautique",
      year: 2021,
      length: 17
    },
    {
      id: "b-002",
      name: "Riva Aquariva Super",
      port: "Saint-Jean-Cap-Ferrat",
      type: "Day boat",
      price: 2800,
      status: "En charter",
      owner: "Privé",
      year: 2020,
      length: 10
    },
    {
      id: "b-003",
      name: "Princess V50",
      port: "Antibes",
      type: "Yacht sport",
      price: 3900,
      status: "Disponible",
      owner: "Broker partenaire",
      year: 2019,
      length: 16
    }
  ],
  tasks: [
    {
      id: "t-001",
      title: "Préparer proposition villa",
      owner: "Matteo",
      status: "À faire",
      dueDate: "2026-06-05",
      linkedTo: "Location villa été - Cannes"
    },
    {
      id: "t-002",
      title: "Préparer proposition villa",
      owner: "Matteo",
      status: "En cours",
      dueDate: "2026-06-04",
      linkedTo: "Mandat gestion villa Cap-Ferrat"
    },
    {
      id: "t-003",
      title: "Préparer proposition villa",
      owner: "Admin",
      status: "À faire",
      dueDate: "2026-06-08",
      linkedTo: "Villa Azur"
    }
  ]
};
