import type { VendorInvoice, VendorQuote } from "./types";
import {
  euroAmountToCents,
  getRemainingEuroAmount,
  normalizeEuroAmount,
  sumEuroAmounts
} from "./currency";

export function normalizeVendorQuoteFinancials(quote: VendorQuote): VendorQuote {
  return {
    ...quote,
    amount: normalizeEuroAmount(quote.amount)
  };
}

export function normalizeVendorInvoiceFinancials(invoice: VendorInvoice): VendorInvoice {
  return {
    ...invoice,
    amount: normalizeEuroAmount(invoice.amount),
    paidAmount: normalizeEuroAmount(invoice.paidAmount)
  };
}

export function getVendorInvoiceStatus(
  amount: unknown,
  paidAmount: unknown,
  dueDate?: string,
  today = new Date()
): VendorInvoice["status"] {
  const amountCents = euroAmountToCents(amount);
  const paidAmountCents = euroAmountToCents(paidAmount);

  if (amountCents > 0 && paidAmountCents >= amountCents) return "Payé";
  if (paidAmountCents > 0 && paidAmountCents < amountCents) return "Partiellement payé";

  if (dueDate) {
    const currentDay = new Date(today);
    currentDay.setHours(0, 0, 0, 0);

    const due = new Date(`${dueDate}T00:00:00`);
    due.setHours(0, 0, 0, 0);

    if (!Number.isNaN(due.getTime()) && due.getTime() < currentDay.getTime()) {
      return "En retard";
    }
  }

  return "À payer";
}

export function getVendorInvoiceRemaining(invoice: Pick<VendorInvoice, "amount" | "paidAmount">) {
  return getRemainingEuroAmount(invoice.amount, invoice.paidAmount);
}

export function getVendorInvoiceTotalRemaining(
  invoices: Array<Pick<VendorInvoice, "amount" | "paidAmount">>
) {
  return sumEuroAmounts(invoices.map(getVendorInvoiceRemaining));
}

export function createPendingVendorInvoiceFromQuote(
  quote: VendorQuote,
  invoiceId: string,
  existingInvoice?: VendorInvoice,
  createdAt = new Date().toISOString()
): VendorInvoice {
  const hasInvoiceDocument = Boolean(
    existingInvoice?.invoiceDocumentStoragePath || existingInvoice?.invoiceDocumentUrl
  );
  const amount = normalizeEuroAmount(
    hasInvoiceDocument ? existingInvoice?.amount : quote.amount
  );
  const paidAmount = normalizeEuroAmount(existingInvoice?.paidAmount ?? 0);

  if (existingInvoice) {
    return {
      ...existingInvoice,
      contactId: quote.contactId,
      contactName: quote.contactName,
      contactPersonName: quote.contactPersonName,
      category: quote.category,
      title: hasInvoiceDocument
        ? existingInvoice.title
        : `Facture attendue · ${quote.title}`,
      amount,
      paidAmount,
      sourceQuoteId: quote.id,
      sourceQuoteReference: quote.quoteReference,
      status: hasInvoiceDocument
        ? getVendorInvoiceStatus(amount, paidAmount, existingInvoice.dueDate)
        : "En attente de facture"
    };
  }

  return {
    id: invoiceId,
    contactId: quote.contactId,
    contactName: quote.contactName,
    contactPersonName: quote.contactPersonName,
    category: quote.category,
    title: `Facture attendue · ${quote.title}`,
    invoiceDate: "",
    dueDate: "",
    amount,
    paidAmount,
    status: "En attente de facture",
    sourceQuoteId: quote.id,
    sourceQuoteReference: quote.quoteReference,
    invoiceReceivedAt: "",
    linkedDocumentId: "",
    invoiceDocumentUrl: "",
    invoiceDocumentStoragePath: "",
    invoiceDocumentName: "",
    paymentMethod: "",
    notes: `Créée automatiquement depuis le devis ${quote.quoteReference}.${quote.notes ? `\n\n${quote.notes}` : ""}`,
    createdAt
  };
}
