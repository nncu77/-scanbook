import * as XLSX from "xlsx";
import { receiptsToRows, receiptsToItemRows, type ReceiptRow } from "./csv";

export function toXlsx(receipts: ReceiptRow[]): ArrayBuffer {
  const wb = XLSX.utils.book_new();

  const rows = receiptsToRows(receipts);
  const receiptsSheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, receiptsSheet, "Receipts");

  const items = receiptsToItemRows(receipts);
  if (items.length > 0) {
    const itemsSheet = XLSX.utils.json_to_sheet(items);
    XLSX.utils.book_append_sheet(wb, itemsSheet, "Items");
  }

  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
