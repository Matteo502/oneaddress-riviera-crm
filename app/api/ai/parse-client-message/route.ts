import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const crmExtractionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    contact: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string" },
        type: { type: "string" },
        clientLevel: { type: "string" },
        preferredLanguage: { type: "string" },
        relationship: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        city: { type: "string" },
        postalAddress: { type: "string" },
        budget: { type: "string" },
        source: { type: "string" },
        preferences: { type: "string" },
        importantNotes: { type: "string" },
        notes: { type: "string" }
      },
      required: [
        "name",
        "type",
        "clientLevel",
        "preferredLanguage",
        "relationship",
        "email",
        "phone",
        "city",
        "postalAddress",
        "budget",
        "source",
        "preferences",
        "importantNotes",
        "notes"
      ]
    },
    lead: {
      type: "object",
      additionalProperties: false,
      properties: {
        category: { type: "string" },
        contact: { type: "string" },
        proposedAsset: { type: "string" },
        rentalStartDate: { type: "string" },
        rentalEndDate: { type: "string" },
        value: { type: "string" },
        status: { type: "string" },
        priority: { type: "string" },
        responseDeadline: { type: "string" },
        nextAction: { type: "string" },
        internalNotes: { type: "string" }
      },
      required: [
        "category",
        "contact",
        "proposedAsset",
        "rentalStartDate",
        "rentalEndDate",
        "value",
        "status",
        "priority",
        "responseDeadline",
        "nextAction",
        "internalNotes"
      ]
    },
    confidence: {
      type: "string",
      enum: ["faible", "moyenne", "haute"]
    },
    missingInformation: {
      type: "array",
      items: { type: "string" }
    },
    warnings: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: ["contact", "lead", "confidence", "missingInformation", "warnings"]
};

function fallbackValue(value: unknown) {
  const text = String(value ?? "").trim();
  return text || "À compléter";
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
    const message = String(body?.message ?? "").trim();

    if (!message) {
      return NextResponse.json(
        { error: "Message client manquant." },
        { status: 400 }
      );
    }

    if (message.length > 6000) {
      return NextResponse.json(
        { error: "Message trop long. Limite : 6000 caractères." },
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

    if (forbiddenPatterns.some((pattern) => pattern.test(message))) {
      return NextResponse.json(
        { error: "Ce texte ressemble à du code ou à une commande terminal, pas à une demande client." },
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
            "Tu extrais des informations CRM pour One Address Riviera. Tu ne dois jamais inventer. Si une information manque, écris exactement 'À compléter'. Les dates doivent être au format jj/mm/aaaa si possible. Le statut par défaut d'un lead est 'Nouveau'. La priorité par défaut est 'Moyenne'. Le type de contact par défaut est 'Client'. Le niveau client par défaut est 'Standard'. La relation par défaut est 'Prospect'."
        },
        {
          role: "user",
          content: message
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "one_address_riviera_crm_extraction",
          strict: true,
          schema: crmExtractionSchema
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

    const safePayload = {
      contact: {
        name: fallbackValue(parsed.contact?.name),
        type: fallbackValue(parsed.contact?.type),
        clientLevel: fallbackValue(parsed.contact?.clientLevel),
        preferredLanguage: fallbackValue(parsed.contact?.preferredLanguage),
        relationship: fallbackValue(parsed.contact?.relationship),
        email: fallbackValue(parsed.contact?.email),
        phone: fallbackValue(parsed.contact?.phone),
        city: fallbackValue(parsed.contact?.city),
        postalAddress: fallbackValue(parsed.contact?.postalAddress),
        budget: fallbackValue(parsed.contact?.budget),
        source: fallbackValue(parsed.contact?.source),
        preferences: fallbackValue(parsed.contact?.preferences),
        importantNotes: fallbackValue(parsed.contact?.importantNotes),
        notes: fallbackValue(parsed.contact?.notes)
      },
      lead: {
        category: fallbackValue(parsed.lead?.category),
        contact: fallbackValue(parsed.lead?.contact),
        proposedAsset: fallbackValue(parsed.lead?.proposedAsset),
        rentalStartDate: fallbackValue(parsed.lead?.rentalStartDate),
        rentalEndDate: fallbackValue(parsed.lead?.rentalEndDate),
        value: fallbackValue(parsed.lead?.value),
        status: fallbackValue(parsed.lead?.status),
        priority: fallbackValue(parsed.lead?.priority),
        responseDeadline: fallbackValue(parsed.lead?.responseDeadline),
        nextAction: fallbackValue(parsed.lead?.nextAction),
        internalNotes: fallbackValue(parsed.lead?.internalNotes)
      },
      confidence: parsed.confidence || "moyenne",
      missingInformation: Array.isArray(parsed.missingInformation) ? parsed.missingInformation : [],
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : []
    };

    return NextResponse.json(safePayload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur IA inconnue.";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
