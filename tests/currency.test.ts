import assert from "node:assert/strict";
import test from "node:test";

import {
  formatEuroAmount,
  formatEuroInput,
  getRemainingEuroAmount,
  normalizeEuroAmount,
  parseEuroAmount,
  sumEuroAmounts
} from "../lib/currency";
import {
  createPendingVendorInvoiceFromQuote,
  getVendorInvoiceRemaining,
  getVendorInvoiceTotalRemaining,
  normalizeVendorInvoiceFinancials
} from "../lib/vendorFinance";
import type { VendorQuote } from "../lib/types";

function vendorQuote(amount: number): VendorQuote {
  return {
    id: "vendor-quote-test",
    contactId: "contact-green-gardens",
    contactName: "Green Gardens",
    category: "Paysagiste",
    title: "Entretien jardin",
    quoteReference: "DEV-PREST-TEST",
    quoteDate: "2026-07-01",
    validUntil: "2026-08-01",
    amount,
    status: "Validé",
    createdAt: "2026-07-01T00:00:00.000Z"
  };
}

test("parse les saisies françaises et internationales sans perdre les centimes", () => {
  assert.equal(parseEuroAmount("1023,70"), 1023.7);
  assert.equal(parseEuroAmount("1023.70"), 1023.7);
  assert.equal(parseEuroAmount("1 023,70"), 1023.7);
  assert.equal(parseEuroAmount("1 023.70"), 1023.7);
  assert.equal(parseEuroAmount("1023,7"), 1023.7);
  assert.equal(parseEuroAmount("1 023,75"), 1023.75);
  assert.equal(parseEuroAmount("0,01"), 0.01);
});

test("affiche toujours deux décimales en français", () => {
  assert.equal(formatEuroAmount(1023.7), "1 023,70 €");
  assert.equal(formatEuroAmount(1024), "1 024,00 €");
  assert.equal(formatEuroAmount(0), "0,00 €");
  assert.equal(formatEuroAmount(1128.17), "1 128,17 €");
});

test("calcule le reste à payer en centimes entiers", () => {
  assert.equal(getRemainingEuroAmount("1023,70", "0,30"), 1023.4);
  assert.equal(
    getVendorInvoiceRemaining({ amount: 1023.7, paidAmount: 0.3 }),
    1023.4
  );
});

test("additionne plusieurs factures sans erreur flottante", () => {
  assert.equal(sumEuroAmounts([1023.7, 0.1, 0.2, 104.17]), 1128.17);
  assert.equal(sumEuroAmounts([0.01, 0.02, 0.03]), 0.06);
  assert.equal(
    getVendorInvoiceTotalRemaining([
      { amount: 1023.7, paidAmount: 0.3 },
      { amount: 104.77, paidAmount: 0 }
    ]),
    1128.17
  );
});

test("crée une facture automatique exacte depuis un devis à 1023,70", () => {
  const quote = vendorQuote(parseEuroAmount("1023,70"));
  const invoice = createPendingVendorInvoiceFromQuote(
    quote,
    "invoice-test",
    undefined,
    "2026-07-01T12:00:00.000Z"
  );

  assert.equal(invoice.amount, 1023.7);
  assert.equal(invoice.paidAmount, 0);
  assert.equal(invoice.status, "En attente de facture");
  assert.equal(invoice.sourceQuoteId, quote.id);
});

test("modifie puis normalise une facture sans perdre les centimes", () => {
  const original = createPendingVendorInvoiceFromQuote(
    vendorQuote(1023.7),
    "invoice-test",
    undefined,
    "2026-07-01T12:00:00.000Z"
  );
  const amountInput = formatEuroInput(original.amount);
  const paidInput = formatEuroInput(0.3);
  const saved = normalizeVendorInvoiceFinancials({
    ...original,
    amount: parseEuroAmount(amountInput),
    paidAmount: parseEuroAmount(paidInput)
  });

  assert.equal(amountInput, "1023,70");
  assert.equal(saved.amount, 1023.7);
  assert.equal(saved.paidAmount, 0.3);
  assert.equal(getVendorInvoiceRemaining(saved), 1023.4);
  assert.equal(normalizeEuroAmount(saved.amount), 1023.7);
});
