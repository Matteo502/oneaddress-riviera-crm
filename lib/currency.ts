const euroFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function parseEuroNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const compact = String(value ?? "")
    .trim()
    .replace(/[\s\u00a0\u202f]/g, "")
    .replace(/€/g, "");

  if (!compact) return 0;

  const lastComma = compact.lastIndexOf(",");
  const lastDot = compact.lastIndexOf(".");
  const decimalIndex = Math.max(lastComma, lastDot);
  const signPrefixLength = /^[+-]/.test(compact) ? 1 : 0;
  const sign = compact.startsWith("-") ? "-" : "";
  const unsigned = compact.replace(/^[+-]/, "");
  const unsignedDecimalIndex = decimalIndex >= 0 ? decimalIndex - signPrefixLength : -1;
  const integerPart = unsignedDecimalIndex >= 0
    ? unsigned.slice(0, unsignedDecimalIndex).replace(/[.,]/g, "")
    : unsigned.replace(/[.,]/g, "");
  const decimalPart = unsignedDecimalIndex >= 0
    ? unsigned.slice(unsignedDecimalIndex + 1).replace(/[.,]/g, "")
    : "";
  const normalized = `${sign}${integerPart || "0"}${decimalPart ? `.${decimalPart}` : ""}`;
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : 0;
}

export function euroAmountToCents(value: unknown) {
  const amount = parseEuroNumber(value);
  const roundingGuard = Math.sign(amount) * Number.EPSILON;
  return Math.round((amount + roundingGuard) * 100);
}

export function euroCentsToAmount(cents: number) {
  if (!Number.isFinite(cents)) return 0;
  return Math.trunc(cents) / 100;
}

export function normalizeEuroAmount(value: unknown) {
  return euroCentsToAmount(euroAmountToCents(value));
}

export function parseEuroAmount(value: unknown) {
  return normalizeEuroAmount(value);
}

export function formatEuroAmount(value: unknown) {
  return euroFormatter
    .format(normalizeEuroAmount(value))
    .replace(/[\u00a0\u202f]/g, " ");
}

export function formatEuroInput(value: unknown) {
  return normalizeEuroAmount(value).toFixed(2).replace(".", ",");
}

export function sumEuroAmounts(values: Iterable<unknown>) {
  let cents = 0;

  for (const value of values) {
    cents += euroAmountToCents(value);
  }

  return euroCentsToAmount(cents);
}

export function subtractEuroAmounts(amount: unknown, paidAmount: unknown) {
  return euroCentsToAmount(euroAmountToCents(amount) - euroAmountToCents(paidAmount));
}

export function getRemainingEuroAmount(amount: unknown, paidAmount: unknown) {
  return euroCentsToAmount(
    Math.max(euroAmountToCents(amount) - euroAmountToCents(paidAmount), 0)
  );
}
