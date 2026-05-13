"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const CATEGORIES = ["餐飲", "交通", "辦公", "住宿", "其他"] as const;

type Bbox = { x: number; y: number; width: number; height: number };
type Field<T> = { value: T; confidence: number; source_bbox?: Bbox };
type Item = { name: string; quantity: number | null; unit_price: number | null; amount: number | null };
type ExtractionData = {
  merchant_name: Field<string>;
  tax_id: Field<string | null>;
  date: Field<string>;
  invoice_number: Field<string | null>;
  total_amount: Field<number>;
  tax_amount: Field<number | null>;
  subtotal: Field<number | null>;
  currency: Field<string>;
  category: Field<string>;
  notes: string | null;
  items?: Item[];
};

export interface Receipt {
  id: string;
  user_id: string;
  status: string;
  image_url: string | null;
  raw_extraction: { data?: ExtractionData; router_path?: string } | null;
  corrected_data: ExtractionData | null;
  model_used: string | null;
  processing_ms: number | null;
  token_cost_usd: string | number | null;
  error_message: string | null;
}

export interface DuplicateRef {
  id: string;
  created_at: string;
}

type FieldKey = keyof Omit<ExtractionData, "notes" | "items">;

function confidenceClass(c?: number): string {
  if (c == null) return "border-border";
  if (c >= 0.8) return "border-green-400 bg-green-50/40 dark:bg-green-900/10";
  if (c >= 0.6) return "border-amber-400 bg-amber-50/40 dark:bg-amber-900/10";
  return "border-red-400 bg-red-50/40 dark:bg-red-900/10";
}

function pct(c?: number): string {
  return c == null ? "" : `${Math.round(c * 100)}%`;
}

function FieldShell({
  label,
  confidence,
  onHover,
  children,
}: {
  label: string;
  confidence?: number;
  onHover?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`border rounded-md p-3 transition-colors ${confidenceClass(confidence)}`}
      onMouseEnter={onHover}
    >
      <div className="flex items-center justify-between mb-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
        {confidence != null && (
          <span className="text-xs text-muted-foreground tabular-nums">{pct(confidence)}</span>
        )}
      </div>
      {children}
    </div>
  );
}

export function ReceiptEditor({
  receipt,
  imageUrl,
  duplicates = [],
}: {
  receipt: Receipt;
  imageUrl: string | null;
  duplicates?: DuplicateRef[];
}) {
  const router = useRouter();
  const data = receipt.corrected_data ?? receipt.raw_extraction?.data ?? null;

  const [form, setForm] = useState(() => ({
    merchant_name: data?.merchant_name?.value ?? "",
    tax_id: data?.tax_id?.value ?? "",
    date: data?.date?.value ?? "",
    invoice_number: data?.invoice_number?.value ?? "",
    total_amount: String(data?.total_amount?.value ?? ""),
    tax_amount: data?.tax_amount?.value == null ? "" : String(data.tax_amount.value),
    subtotal: data?.subtotal?.value == null ? "" : String(data.subtotal.value),
    currency: data?.currency?.value ?? "TWD",
    category: data?.category?.value ?? "其他",
    notes: data?.notes ?? "",
  }));
  const [items, setItems] = useState<Item[]>(data?.items ?? []);
  const [hoveredField, setHoveredField] = useState<FieldKey | null>(null);
  const [imageNaturalSize, setImageNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function update<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }
  function updateItem(idx: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function addItem() {
    setItems((prev) => [...prev, { name: "", quantity: null, unit_price: null, amount: null }]);
  }
  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function save() {
    if (!data) return;
    setSaveError(null);
    setSaving(true);
    const corrected: ExtractionData = {
      ...data,
      merchant_name: { ...data.merchant_name, value: form.merchant_name },
      tax_id: { ...data.tax_id, value: form.tax_id.trim() || null },
      date: { ...data.date, value: form.date },
      invoice_number: { ...data.invoice_number, value: form.invoice_number.trim() || null },
      total_amount: { ...data.total_amount, value: Number(form.total_amount) },
      tax_amount: { ...data.tax_amount, value: form.tax_amount === "" ? null : Number(form.tax_amount) },
      subtotal: { ...data.subtotal, value: form.subtotal === "" ? null : Number(form.subtotal) },
      currency: { ...data.currency, value: form.currency },
      category: { ...data.category, value: form.category },
      notes: form.notes.trim() || null,
      items,
    };
    const res = await fetch(`/api/receipts/${receipt.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ corrected_data: corrected }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      const msg = body.error ?? `HTTP ${res.status}`;
      setSaveError(msg);
      setSaving(false);
      toast.error(`Save failed: ${msg}`);
      return;
    }
    setSaving(false);
    toast.success("Corrections saved");
    router.refresh();
  }

  const hoveredBbox: Bbox | undefined =
    hoveredField && data ? data[hoveredField]?.source_bbox : undefined;

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div>
        <div
          className="relative"
          onMouseLeave={() => setHoveredField(null)}
        >
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt="Receipt"
              width={1200}
              height={1600}
              unoptimized
              onLoadingComplete={(img) =>
                setImageNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
              }
              className="w-full h-auto rounded-md border block"
            />
          ) : (
            <div className="aspect-[3/4] border rounded-md flex items-center justify-center text-muted-foreground text-sm">
              No image
            </div>
          )}
          {hoveredBbox && imageNaturalSize && (
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox={`0 0 ${imageNaturalSize.w} ${imageNaturalSize.h}`}
              preserveAspectRatio="none"
            >
              <rect
                x={hoveredBbox.x}
                y={hoveredBbox.y}
                width={hoveredBbox.width}
                height={hoveredBbox.height}
                fill="rgba(245, 158, 11, 0.2)"
                stroke="rgb(245, 158, 11)"
                strokeWidth={Math.max(2, imageNaturalSize.w / 400)}
              />
            </svg>
          )}
        </div>
        {receipt.error_message && (
          <p className="mt-2 text-sm text-destructive">{receipt.error_message}</p>
        )}
        <div className="mt-3 text-xs text-muted-foreground space-y-0.5">
          {receipt.model_used && <div>Model: {receipt.model_used}</div>}
          {receipt.raw_extraction?.router_path && <div>Router: {receipt.raw_extraction.router_path}</div>}
          {receipt.processing_ms != null && <div>Time: {receipt.processing_ms} ms</div>}
          {receipt.token_cost_usd != null && (
            <div>Cost: ${Number(receipt.token_cost_usd).toFixed(4)}</div>
          )}
          {!hoveredBbox && <div className="italic">Hover a field to highlight on image (when bbox is provided).</div>}
        </div>
      </div>

      <div className="space-y-4">
        {duplicates.length > 0 && (
          <div className="border border-amber-400 bg-amber-50/40 dark:bg-amber-900/10 rounded-md p-3 text-sm">
            <div className="font-medium text-amber-700 dark:text-amber-300 mb-1">
              ⚠️ Duplicate invoice number
            </div>
            <div className="text-muted-foreground text-xs mb-2">
              This invoice number also appears in {duplicates.length} other receipt
              {duplicates.length === 1 ? "" : "s"} of yours. Possible double-entry.
            </div>
            <ul className="space-y-0.5">
              {duplicates.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`/receipts/${d.id}`}
                    className="text-xs underline text-amber-700 dark:text-amber-300"
                  >
                    {new Date(d.created_at).toLocaleString()} → /receipts/{d.id.slice(0, 8)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!data ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              {receipt.status === "processing"
                ? "Still processing — refresh in a moment."
                : "No extraction available."}
            </CardContent>
          </Card>
        ) : (
          <>
            <FieldShell label="Merchant" confidence={data.merchant_name.confidence} onHover={() => setHoveredField("merchant_name")}>
              <Input value={form.merchant_name} onChange={(e) => update("merchant_name", e.target.value)} />
            </FieldShell>
            <div className="grid grid-cols-2 gap-3">
              <FieldShell label="統一編號" confidence={data.tax_id.confidence} onHover={() => setHoveredField("tax_id")}>
                <Input
                  value={form.tax_id}
                  onChange={(e) => update("tax_id", e.target.value)}
                  placeholder="8 digits"
                />
              </FieldShell>
              <FieldShell label="Date" confidence={data.date.confidence} onHover={() => setHoveredField("date")}>
                <Input type="date" value={form.date} onChange={(e) => update("date", e.target.value)} />
              </FieldShell>
            </div>
            <FieldShell label="Invoice number" confidence={data.invoice_number.confidence} onHover={() => setHoveredField("invoice_number")}>
              <Input
                value={form.invoice_number}
                onChange={(e) => update("invoice_number", e.target.value)}
                placeholder="AB-12345678"
              />
            </FieldShell>
            <div className="grid grid-cols-3 gap-3">
              <FieldShell label="Subtotal" confidence={data.subtotal.confidence} onHover={() => setHoveredField("subtotal")}>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={form.subtotal}
                  onChange={(e) => update("subtotal", e.target.value)}
                />
              </FieldShell>
              <FieldShell label="Tax" confidence={data.tax_amount.confidence} onHover={() => setHoveredField("tax_amount")}>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={form.tax_amount}
                  onChange={(e) => update("tax_amount", e.target.value)}
                />
              </FieldShell>
              <FieldShell label="Total" confidence={data.total_amount.confidence} onHover={() => setHoveredField("total_amount")}>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={form.total_amount}
                  onChange={(e) => update("total_amount", e.target.value)}
                />
              </FieldShell>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FieldShell label="Currency" onHover={() => setHoveredField("currency")}>
                <Input value={form.currency} onChange={(e) => update("currency", e.target.value)} />
              </FieldShell>
              <FieldShell label="Category" confidence={data.category.confidence} onHover={() => setHoveredField("category")}>
                <select
                  value={form.category}
                  onChange={(e) => update("category", e.target.value)}
                  className="border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </FieldShell>
            </div>

            <div className="border rounded-md p-3">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Items</Label>
                <Button type="button" variant="ghost" size="sm" onClick={addItem}>+ Add row</Button>
              </div>
              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground">No line items.</p>
              ) : (
                <div className="space-y-2">
                  {items.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_60px_80px_80px_28px] gap-1.5 items-center">
                      <Input
                        value={it.name}
                        onChange={(e) => updateItem(idx, { name: e.target.value })}
                        placeholder="Name"
                        className="h-8"
                      />
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="1"
                        value={it.quantity ?? ""}
                        onChange={(e) =>
                          updateItem(idx, { quantity: e.target.value === "" ? null : Number(e.target.value) })
                        }
                        placeholder="Qty"
                        className="h-8"
                      />
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        value={it.unit_price ?? ""}
                        onChange={(e) =>
                          updateItem(idx, { unit_price: e.target.value === "" ? null : Number(e.target.value) })
                        }
                        placeholder="Unit"
                        className="h-8"
                      />
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        value={it.amount ?? ""}
                        onChange={(e) =>
                          updateItem(idx, { amount: e.target.value === "" ? null : Number(e.target.value) })
                        }
                        placeholder="Amount"
                        className="h-8"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeItem(idx)}
                        aria-label="Remove item"
                        title="Remove"
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <FieldShell label="Notes">
              <Textarea
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                rows={3}
              />
            </FieldShell>

            {saveError && <p className="text-sm text-destructive">{saveError}</p>}
            <div className="flex items-center justify-between pt-2">
              <Badge variant={receipt.status === "reviewed" ? "default" : "outline"}>
                {receipt.status === "reviewed" ? "Reviewed" : "Needs review"}
              </Badge>
              <Button onClick={save} disabled={saving}>
                {saving ? "Saving..." : "Save corrections"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
