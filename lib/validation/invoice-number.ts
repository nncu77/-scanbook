const RAW = /^[A-Z]{2}\d{8}$/;

export function normalizeInvoiceNumber(s: string | null | undefined): string | null {
  if (!s) return null;
  const cleaned = s.trim().toUpperCase().replace(/[\s-]/g, "");
  if (!RAW.test(cleaned)) return null;
  return `${cleaned.slice(0, 2)}-${cleaned.slice(2)}`;
}

export function isValidInvoiceNumber(s: string | null | undefined): boolean {
  return normalizeInvoiceNumber(s) !== null;
}
