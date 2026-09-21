// Format a numeric text input with thousands separators as the user types:
// "1000" -> "1,000". Set allowDecimal for float fields (keeps up to 2 decimals).
// The value is never scaled — 100 means 100, not cents.
export function formatNumberInput(value: string, allowDecimal = false): string {
  if (value === null || value === undefined || value === "") return "";
  // Preserve a leading minus. Stripping it (the old behaviour) made negatives
  // impossible to type AND silently flipped an edit-prefill of -50 into +50.
  const negative = String(value).trim().startsWith("-");
  let cleaned = allowDecimal
    ? String(value).replace(/[^0-9.]/g, "")
    : String(value).replace(/[^0-9]/g, "");

  if (allowDecimal) {
    const parts = cleaned.split(".");
    if (parts.length > 1) {
      cleaned = parts[0] + "." + parts.slice(1).join("").slice(0, 2);
    }
  }

  const [intPart, decPart] = cleaned.split(".");
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = decPart !== undefined ? withCommas + "." + decPart : withCommas;
  // Allow "-" on its own so the user can start typing a negative number.
  if (body === "") return negative ? "-" : "";
  return (negative ? "-" : "") + body;
}

// Strip the separators back to a plain number for the API payload.
export function parseNumberInput(value: string): number {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}
