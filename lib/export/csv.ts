type Field<T> = { value: T };
type Item = {
  name: string;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
};
type ExtractionData = {
  merchant_name?: Field<string>;
  tax_id?: Field<string | null>;
  date?: Field<string>;
  invoice_number?: Field<string | null>;
  subtotal?: Field<number | null>;
  tax_amount?: Field<number | null>;
  total_amount?: Field<number>;
  currency?: Field<string>;
  category?: Field<string>;
  items?: Item[];
};

export interface ReceiptRow {
  id: string;
  status: string;
  raw_extraction: { data?: ExtractionData } | null;
  corrected_data: ExtractionData | null;
  model_used: string | null;
  processing_ms: number | null;
  token_cost_usd: string | number | null;
  created_at: string;
}

export interface FlatRow {
  id: string;
  date: string;
  merchant: string;
  tax_id: string;
  invoice_number: string;
  subtotal: string | number;
  tax: string | number;
  total: string | number;
  currency: string;
  category: string;
  items_count: number;
  status: string;
  model: string;
  processing_ms: string | number;
  cost_usd: string | number;
  created_at: string;
}

export interface ItemRow {
  receipt_id: string;
  line: number;
  name: string;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
}

const COLUMNS: (keyof FlatRow)[] = [
  "id",
  "date",
  "merchant",
  "tax_id",
  "invoice_number",
  "subtotal",
  "tax",
  "total",
  "currency",
  "category",
  "items_count",
  "status",
  "model",
  "processing_ms",
  "cost_usd",
  "created_at",
];

export function receiptsToRows(receipts: ReceiptRow[]): FlatRow[] {
  return receipts.map((r) => {
    const d = r.corrected_data ?? r.raw_extraction?.data ?? null;
    return {
      id: r.id,
      date: d?.date?.value ?? "",
      merchant: d?.merchant_name?.value ?? "",
      tax_id: d?.tax_id?.value ?? "",
      invoice_number: d?.invoice_number?.value ?? "",
      subtotal: d?.subtotal?.value ?? "",
      tax: d?.tax_amount?.value ?? "",
      total: d?.total_amount?.value ?? "",
      currency: d?.currency?.value ?? "",
      category: d?.category?.value ?? "",
      items_count: d?.items?.length ?? 0,
      status: r.status,
      model: r.model_used ?? "",
      processing_ms: r.processing_ms ?? "",
      cost_usd: r.token_cost_usd ?? "",
      created_at: r.created_at,
    };
  });
}

export function receiptsToItemRows(receipts: ReceiptRow[]): ItemRow[] {
  const rows: ItemRow[] = [];
  for (const r of receipts) {
    const d = r.corrected_data ?? r.raw_extraction?.data ?? null;
    const items = d?.items ?? [];
    items.forEach((it, i) => {
      rows.push({
        receipt_id: r.id,
        line: i + 1,
        name: it.name,
        quantity: it.quantity,
        unit_price: it.unit_price,
        amount: it.amount,
      });
    });
  }
  return rows;
}

function escapeCsv(v: unknown): string {
  if (v == null || v === "") return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(receipts: ReceiptRow[]): string {
  const rows = receiptsToRows(receipts);
  const lines = [COLUMNS.join(",")];
  for (const r of rows) {
    lines.push(COLUMNS.map((c) => escapeCsv(r[c])).join(","));
  }
  return "﻿" + lines.join("\r\n");
}
