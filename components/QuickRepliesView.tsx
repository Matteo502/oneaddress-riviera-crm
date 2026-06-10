"use client";

import { useMemo, useState } from "react";

type QuickReplyTemplate = {
  id: string;
  title: string;
  category: string;
  language: string;
  channel: "WhatsApp" | "Email";
  message: string;
};

const clean = (text: string) => text.trim();

const templates: QuickReplyTemplate[] = [
  {
    id: "demande-vague",
    title: "Demande vague",
    category: "Demande vague",
    language: "English",
    channel: "WhatsApp",
    message: clean(`
Hello,

Thank you for your message.

One Address Riviera arranges private Riviera services including villas, luxury cars, private boats, chauffeurs, chefs, security and tailored concierge support.

To guide you properly, could you please share:
- Your requested service
- Dates
- Preferred location
- Number of guests / passengers
- Estimated budget
- Any specific preferences

Once we have these details, we can review suitable private options.

Kind regards,
Matteo
One Address Riviera
`)
  },
  {
    id: "villa",
    title: "Villa",
    category: "Villa",
    language: "English",
    channel: "WhatsApp",
    message: clean(`
Hello,

Thank you for your request.

To review suitable private villa options, could you please share:
- Preferred location
- Arrival and departure dates
- Number of guests
- Number of bedrooms required
- Estimated weekly budget
- Preferred style: sea view, walking distance, modern villa, staffed estate, privacy, events, etc.

Once we have these details, we can check relevant private options and come back with a curated selection.

Kind regards,
Matteo
One Address Riviera
`)
  },
  {
    id: "voiture",
    title: "Luxury car",
    category: "Voiture",
    language: "English",
    channel: "WhatsApp",
    message: clean(`
Hello,

Thank you for your request.

To check suitable luxury car options, could you please confirm:
- Dates
- Pick-up and drop-off location
- Preferred vehicle type: SUV, convertible, supercar, luxury sedan, van
- Self-drive or chauffeur service
- Number of passengers
- Estimated budget

Once confirmed, we can review available options and come back with suitable vehicles.

Kind regards,
Matteo
One Address Riviera
`)
  },
  {
    id: "yacht-boat",
    title: "Yacht / boat",
    category: "Yacht / Boat",
    language: "English",
    channel: "WhatsApp",
    message: clean(`
Hello,

Thank you for your request.

To review private boat options, could you please confirm:
- Preferred date
- Departure area: Cannes, Monaco, Saint-Tropez, Nice, Antibes, etc.
- Number of guests
- Full day or half day
- Preferred boat style or size
- Estimated budget
- Any preferred itinerary or onboard services

Once we have these details, we can check suitable private options.

Kind regards,
Matteo
One Address Riviera
`)
  },
  {
    id: "chauffeur-transfer",
    title: "Chauffeur / transfer",
    category: "Chauffeur / Transfer",
    language: "English",
    channel: "WhatsApp",
    message: clean(`
Hello,

Thank you for your request.

Could you please confirm:
- Date and time
- Pick-up location
- Drop-off location
- Flight number if airport arrival
- Number of passengers
- Luggage quantity
- Preferred vehicle type: luxury sedan, SUV or van
- Whether you need a simple transfer or a private chauffeur during your stay

Once confirmed, we can review the best option for you.

Kind regards,
Matteo
One Address Riviera
`)
  },
  {
    id: "concierge-full-stay",
    title: "Concierge / full stay planning",
    category: "Concierge / Full stay planning",
    language: "English",
    channel: "Email",
    message: clean(`
Hello,

Thank you for your request.

One Address Riviera can assist with tailored private arrangements across the French Riviera, including villas, cars, boats, chauffeurs, private chefs, restaurants, experiences and security.

To understand your needs, could you please share:
- Dates
- Location
- Number of guests
- Services required
- Estimated budget
- Any specific preferences or priorities

We will then review what can be arranged privately for your stay.

Kind regards,
Matteo
One Address Riviera
`)
  },
  {
    id: "candidat",
    title: "Candidat / recherche d’emploi",
    category: "Candidat / recherche d’emploi",
    language: "English",
    channel: "Email",
    message: clean(`
Hello,

Thank you for your message.

This contact channel is dedicated to private client requests only. Career, employment and job applications are not handled through WhatsApp or the private access form.

If recruitment opens in the future, applications will be handled through a dedicated process.

Kind regards,
One Address Riviera
`)
  },
  {
    id: "hors-budget",
    title: "Hors budget / demande non adaptée",
    category: "Hors budget / demande non adaptée",
    language: "English",
    channel: "WhatsApp",
    message: clean(`
Hello,

Thank you for your message.

Based on the level of service requested, this may not be aligned with the private options we usually arrange at One Address Riviera.

We focus on tailored, high-standard private services with vetted partners across the French Riviera.

If your requirements or budget evolve, we would be happy to review a new request.

Kind regards,
Matteo
One Address Riviera
`)
  },
  {
    id: "follow-up-24h",
    title: "Follow-up 24h",
    category: "Follow-up 24h",
    language: "English",
    channel: "WhatsApp",
    message: clean(`
Hello,

I’m following up regarding your request with One Address Riviera.

To move forward, could you please confirm the missing details when convenient:
- Dates
- Location
- Number of guests / passengers
- Service required
- Estimated budget

Once confirmed, we can review suitable private options.

Kind regards,
Matteo
One Address Riviera
`)
  },
  {
    id: "follow-up-72h",
    title: "Follow-up 72h",
    category: "Follow-up 72h",
    language: "English",
    channel: "WhatsApp",
    message: clean(`
Hello,

Just following up once more regarding your private request.

Without the required details, we are unable to review suitable options properly.

If your project is still active, feel free to send the dates, location, service required and estimated budget, and we will review what may be available.

Kind regards,
Matteo
One Address Riviera
`)
  }
];

export default function QuickRepliesView() {
  const [selectedCategory, setSelectedCategory] = useState("Toutes");
  const [copiedId, setCopiedId] = useState("");

  const categories = useMemo(
    () => ["Toutes", ...Array.from(new Set(templates.map((template) => template.category)))],
    []
  );

  const visibleTemplates =
    selectedCategory === "Toutes"
      ? templates
      : templates.filter((template) => template.category === selectedCategory);

  async function copyTemplate(template: QuickReplyTemplate) {
    try {
      await navigator.clipboard.writeText(template.message);
      setCopiedId(template.id);
      window.setTimeout(() => setCopiedId(""), 1600);
    } catch {
      window.alert("Copie impossible. Sélectionne le texte manuellement.");
    }
  }

  return (
    <section className="card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Traitement rapide</p>
          <h3>Réponses rapides</h3>
        </div>
        <p className="muted-line">Templates internes à copier pour WhatsApp ou email.</p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 22 }}>
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            className={selectedCategory === category ? "primary-button" : "secondary-button"}
            onClick={() => setSelectedCategory(category)}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="list-stack">
        {visibleTemplates.map((template) => (
          <article key={template.id} className="card" style={{ boxShadow: "none" }}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">{template.category}</p>
                <h3>{template.title}</h3>
                <p className="muted-line">
                  {template.language} · {template.channel}
                </p>
              </div>

              <button className="primary-button" type="button" onClick={() => copyTemplate(template)}>
                {copiedId === template.id ? "Copié" : "Copier"}
              </button>
            </div>

            <pre
              style={{
                whiteSpace: "pre-wrap",
                margin: 0,
                fontFamily: "inherit",
                lineHeight: 1.65,
                color: "#071f27"
              }}
            >
              {template.message}
            </pre>
          </article>
        ))}
      </div>
    </section>
  );
}
