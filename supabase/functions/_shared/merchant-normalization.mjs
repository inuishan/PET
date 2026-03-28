export function normalizeMerchantName(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
