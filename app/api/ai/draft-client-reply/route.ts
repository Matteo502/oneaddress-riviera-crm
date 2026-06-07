import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const replySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    subject: { type: "string" },
    clientReply: { type: "string" },
    nextAction: { type: "string" },
    priority: {
      type: "string",
      enum: ["Basse", "Moyenne", "Haute"]
    },
    missingInformation: {
      type: "array",
      items: { type: "string" }
    },
    internalNotes: { type: "string" }
  },
  required: [
    "subject",
    "clientReply",
    "nextAction",
    "priority",
    "missingInformation",
    "internalNotes"
  ]
};

function cleanText(value: unknown) {
  return String(value ?? "").trim();
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY manquante côté serveur." },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => null);

    const clientMessage = cleanText(body?.clientMessage);
    const contactName = cleanText(body?.contactName);
    const leadCategory = cleanText(body?.leadCategory);
    const dates = cleanText(body?.dates);
    const budget = cleanText(body?.budget);
    const proposedAsset = cleanText(body?.proposedAsset);
    const notes = cleanText(body?.notes);

    if (!clientMessage && !notes) {
      return NextResponse.json(
        { error: "Message client ou notes internes manquants." },
        { status: 400 }
      );
    }

    const forbiddenPatterns = [
      /git\s+(add|commit|push|checkout|status)/i,
      /npm\s+(run|install|build)/i,
      /components\/CRMApp\.tsx/i,
      /function\s+\w+/i,
      /const\s+\w+\s*=/i,
      /<button|<div|<section/i
    ];

    const combinedText = [clientMessage, notes].filter(Boolean).join("\n\n");

    if (forbiddenPatterns.some((pattern) => pattern.test(combinedText))) {
      return NextResponse.json(
        { error: "Ce texte ressemble à du code ou à une commande terminal, pas à une demande client." },
        { status: 400 }
      );
    }

    if (combinedText.length > 6000) {
      return NextResponse.json(
        { error: "Texte trop long. Limite : 6000 caractères." },
        { status: 400 }
      );
    }

    const client = new OpenAI({ apiKey });

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Tu es l'assistant commercial de One Address Riviera, société premium de villas privées, conciergerie, voitures, bateaux et services sur la Riviera. Tu rédiges des réponses élégantes, courtes, professionnelles, en français ou anglais selon le message client. Tu ne promets jamais une disponibilité non confirmée. Tu ne donnes jamais de prix inventé. Tu proposes une prochaine étape claire. Termine la réponse par 'Kind regards, Matteo'."
        },
        {
          role: "user",
          content: [
            `Nom client : ${contactName || "À compléter"}`,
            `Catégorie lead : ${leadCategory || "À compléter"}`,
            `Dates : ${dates || "À compléter"}`,
            `Budget : ${budget || "À compléter"}`,
            `Actif proposé : ${proposedAsset || "À compléter"}`,
            "",
            "Message client :",
            clientMessage || "À compléter",
            "",
            "Notes internes :",
            notes || "À compléter"
          ].join("\n")
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "one_address_riviera_client_reply",
          strict: true,
          schema: replySchema
        }
      }
    });

    const raw = completion.choices[0]?.message?.content;

    if (!raw) {
      return NextResponse.json(
        { error: "Réponse IA vide." },
        { status: 500 }
      );
    }

    const parsed = JSON.parse(raw);

    return NextResponse.json({
      subject: cleanText(parsed.subject) || "One Address Riviera",
      clientReply: cleanText(parsed.clientReply) || "À compléter",
      nextAction: cleanText(parsed.nextAction) || "Qualifier la demande et répondre au client.",
      priority: cleanText(parsed.priority) || "Moyenne",
      missingInformation: Array.isArray(parsed.missingInformation) ? parsed.missingInformation : [],
      internalNotes: cleanText(parsed.internalNotes) || "À compléter"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur IA inconnue.";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
