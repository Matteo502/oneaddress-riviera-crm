"use client";

import { useMemo, useState } from "react";

type QuickReplyTemplate = {
  id: string;
  title: string;
  situation: string;
  category: string;
  language: "English" | "French";
  channel: "WhatsApp" | "Email";
  message: string;
};

const clean = (text: string) => text.trim();

const templates: QuickReplyTemplate[] = [
  {
    id: "first-reply-whatsapp",
    title: "First client reply",
    situation: "Premier retour client",
    category: "Qualification",
    language: "English",
    channel: "WhatsApp",
    message: clean(`
Hello,

Thank you for your message.

One Address Riviera arranges private Riviera services including villas, luxury cars, private boats, chauffeurs, chefs, security and tailored concierge support.

Could you please share the service you are looking for, the dates, location, number of guests or passengers, and your estimated budget?

Once we have these details, we can review suitable private options.

Kind regards,
Matteo
One Address Riviera
`)
  },
  {
    id: "quote-sent-whatsapp",
    title: "Quote sent",
    situation: "Devis envoyé",
    category: "Devis",
    language: "English",
    channel: "WhatsApp",
    message: clean(`
Hello,

I have just sent you the private proposal for your request.

Please review the details and let me know if you would like to proceed, adjust anything, or check an alternative option.

Availability is not held until confirmation.

Kind regards,
Matteo
One Address Riviera
`)
  },
  {
    id: "quote-sent-email",
    title: "Quote sent - email",
    situation: "Devis envoyé",
    category: "Devis",
    language: "English",
    channel: "Email",
    message: clean(`
Hello,

Please find attached the private proposal prepared for your request.

The proposal includes the selected service, dates, pricing and key terms. Availability remains subject to confirmation until the booking is secured.

Please let me know if you would like to proceed or if any adjustment is required.

Kind regards,
Matteo
One Address Riviera
`)
  },
  {
    id: "follow-up-24h",
    title: "Follow-up 24h",
    situation: "Relance 24h",
    category: "Relance",
    language: "English",
    channel: "WhatsApp",
    message: clean(`
Hello,

I’m following up regarding the private proposal sent yesterday.

Would you like us to hold this option and move forward, or would you prefer that we review an alternative?

Kind regards,
Matteo
One Address Riviera
`)
  },
  {
    id: "follow-up-72h",
    title: "Follow-up 72h",
    situation: "Relance 72h",
    category: "Relance",
    language: "English",
    channel: "WhatsApp",
    message: clean(`
Hello,

Just following up once more regarding your private request.

As availability can move quickly, we will not hold the option without confirmation. If your request is still active, please let me know and we can review the next step.

Kind regards,
Matteo
One Address Riviera
`)
  },
  {
    id: "negotiation",
    title: "Negotiation",
    situation: "Négociation",
    category: "Devis",
    language: "English",
    channel: "WhatsApp",
    message: clean(`
Hello,

Thank you for your feedback.

I will review what can reasonably be adjusted while keeping the service level aligned with the standard requested.

I will come back to you shortly with the best possible option.

Kind regards,
Matteo
One Address Riviera
`)
  },
  {
    id: "accepted",
    title: "Quote accepted",
    situation: "Devis accepté",
    category: "Réservation",
    language: "English",
    channel: "WhatsApp",
    message: clean(`
Hello,

Thank you for your confirmation.

We will now proceed with the booking preparation. To secure everything properly, please confirm the final details and payment timing.

Once confirmed, we will coordinate the service and share the necessary information before the date.

Kind regards,
Matteo
One Address Riviera
`)
  },
  {
    id: "lost-clean",
    title: "Lost cleanly",
    situation: "Devis perdu proprement",
    category: "Perdu",
    language: "English",
    channel: "WhatsApp",
    message: clean(`
Hello,

Thank you for letting us know.

No problem at all. We will close this request for now.

If you need private Riviera arrangements in the future, we would be happy to review a new request.

Kind regards,
Matteo
One Address Riviera
`)
  },
  {
    id: "supplier-confirm",
    title: "Supplier to confirm",
    situation: "Prestataire à confirmer",
    category: "Opérations",
    language: "English",
    channel: "WhatsApp",
    message: clean(`
Hello,

We are currently confirming the selected provider for your request.

Once the operational details are secured, we will send you the final confirmation with timing, contact details and any practical instructions.

Kind regards,
Matteo
One Address Riviera
`)
  },
  {
    id: "booking-confirmed",
    title: "Booking confirmed",
    situation: "Réservation confirmée",
    category: "Réservation",
    language: "English",
    channel: "WhatsApp",
    message: clean(`
Hello,

Your booking is now confirmed.

We will keep the arrangements discreet and coordinated. The practical details will be shared before the service date, including timing, address and contact information if needed.

Kind regards,
Matteo
One Address Riviera
`)
  },
  {
    id: "payment-remaining",
    title: "Payment remaining",
    situation: "Paiement restant",
    category: "Paiement",
    language: "English",
    channel: "WhatsApp",
    message: clean(`
Hello,

A balance remains pending for your confirmed booking.

Could you please arrange the remaining payment before the agreed deadline so we can keep the service fully secured?

Kind regards,
Matteo
One Address Riviera
`)
  },
  {
    id: "villa-qualification",
    title: "Villa qualification",
    situation: "Premier retour client",
    category: "Villa",
    language: "English",
    channel: "WhatsApp",
    message: clean(`
Hello,

To review suitable private villa options, could you please confirm the location, dates, number of guests, number of bedrooms required, preferred style and estimated weekly budget?

Once confirmed, we can check relevant private options and come back with a curated selection.

Kind regards,
Matteo
One Address Riviera
`)
  },
  {
    id: "car-qualification",
    title: "Luxury car qualification",
    situation: "Premier retour client",
    category: "Voiture",
    language: "English",
    channel: "WhatsApp",
    message: clean(`
Hello,

To check suitable luxury car options, could you please confirm the dates, pick-up and drop-off location, preferred vehicle type, whether you need self-drive or chauffeur service, number of passengers and estimated budget?

Kind regards,
Matteo
One Address Riviera
`)
  },
  {
    id: "boat-qualification",
    title: "Boat qualification",
    situation: "Premier retour client",
    category: "Bateau",
    language: "English",
    channel: "WhatsApp",
    message: clean(`
Hello,

To review private boat options, could you please confirm the preferred date, departure area, number of guests, full day or half day, preferred boat style or size, estimated budget and any preferred itinerary?

Kind regards,
Matteo
One Address Riviera
`)
  },
  {
    id: "chauffeur-qualification",
    title: "Chauffeur qualification",
    situation: "Premier retour client",
    category: "Chauffeur",
    language: "English",
    channel: "WhatsApp",
    message: clean(`
Hello,

Could you please confirm the date and time, pick-up location, drop-off location, flight number if relevant, number of passengers, luggage quantity, preferred vehicle type, and whether you need a simple transfer or a private chauffeur during your stay?

Kind regards,
Matteo
One Address Riviera
`)
  },
  {
    id: "not-aligned",
    title: "Not aligned / low budget",
    situation: "Demande non adaptée",
    category: "Qualification",
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
  }
];

const situations = ["Toutes", ...Array.from(new Set(templates.map((template) => template.situation)))];
const categories = ["Toutes", ...Array.from(new Set(templates.map((template) => template.category)))];
const channels = ["Tous", "WhatsApp", "Email"] as const;

export default function QuickRepliesView() {
  const [situation, setSituation] = useState("Toutes");
  const [category, setCategory] = useState("Toutes");
  const [channel, setChannel] = useState<(typeof channels)[number]>("Tous");
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredTemplates = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return templates.filter((template) => {
      const matchesSituation = situation === "Toutes" || template.situation === situation;
      const matchesCategory = category === "Toutes" || template.category === category;
      const matchesChannel = channel === "Tous" || template.channel === channel;
      const matchesQuery = !needle || [
        template.title,
        template.situation,
        template.category,
        template.channel,
        template.message
      ].some((value) => value.toLowerCase().includes(needle));

      return matchesSituation && matchesCategory && matchesChannel && matchesQuery;
    });
  }, [situation, category, channel, query]);

  async function copyMessage(template: QuickReplyTemplate) {
    try {
      await navigator.clipboard.writeText(template.message);
      setCopiedId(template.id);
      window.setTimeout(() => setCopiedId(null), 1600);
    } catch {
      window.alert("Copie impossible. Sélectionnez le texte manuellement.");
    }
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Réponses rapides V2</p>
            <h3>Messages prêts à copier</h3>
          </div>
          <p className="muted-line">
            Choisissez une situation, copiez le message, puis adaptez uniquement les détails client.
          </p>
        </div>

        <div className="form-grid">
          <label>Situation
            <select value={situation} onChange={(event) => setSituation(event.target.value)}>
              {situations.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>

          <label>Catégorie
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>

          <label>Canal
            <select value={channel} onChange={(event) => setChannel(event.target.value as typeof channel)}>
              {channels.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>

          <label>Recherche
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ex : paiement, devis, chauffeur..."
            />
          </label>
        </div>
      </section>

      <section className="card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Bibliothèque</p>
            <h3>{filteredTemplates.length} réponse{filteredTemplates.length > 1 ? "s" : ""}</h3>
          </div>
        </div>

        {filteredTemplates.length === 0 ? (
          <p className="muted-line">Aucune réponse ne correspond aux filtres.</p>
        ) : (
          <div className="list-stack">
            {filteredTemplates.map((template) => (
              <article className="item-card" key={template.id}>
                <div>
                  <p className="eyebrow">{template.situation} · {template.category} · {template.channel}</p>
                  <h3>{template.title}</h3>
                  <textarea
                    readOnly
                    value={template.message}
                    style={{
                      width: "100%",
                      minHeight: 220,
                      marginTop: 14,
                      resize: "vertical"
                    }}
                  />
                </div>

                <div className="item-actions">
                  <span className="status-pill">{template.language}</span>
                  <button className="primary-button" type="button" onClick={() => copyMessage(template)}>
                    {copiedId === template.id ? "Copié" : "Copier"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
