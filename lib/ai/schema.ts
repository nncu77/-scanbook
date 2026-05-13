import { z } from "zod";

export const CATEGORIES = ["餐飲", "交通", "辦公", "住宿", "其他"] as const;
export type Category = (typeof CATEGORIES)[number];

const Bbox = z
  .object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  })
  .optional();

const confidence = z.number().min(0).max(1);

const StringField = z.object({ value: z.string(), confidence, source_bbox: Bbox });
const NullableStringField = z.object({ value: z.string().nullable(), confidence, source_bbox: Bbox });
const NumberField = z.object({ value: z.number(), confidence, source_bbox: Bbox });
const NullableNumberField = z.object({ value: z.number().nullable(), confidence, source_bbox: Bbox });

const CategoryField = z.object({ value: z.enum(CATEGORIES), confidence });

const ItemRow = z.object({
  name: z.string(),
  quantity: z.number().nullable(),
  unit_price: z.number().nullable(),
  amount: z.number().nullable(),
});

export const ReceiptExtractionSchema = z.object({
  merchant_name: StringField,
  tax_id: NullableStringField,
  date: StringField,
  invoice_number: NullableStringField,
  total_amount: NumberField,
  tax_amount: NullableNumberField,
  subtotal: NullableNumberField,
  currency: StringField,
  category: CategoryField,
  items: z.array(ItemRow),
  notes: z.string().nullable(),
});

export type ReceiptExtraction = z.infer<typeof ReceiptExtractionSchema>;

const bboxJsonSchema = {
  type: "object",
  required: ["x", "y", "width", "height"],
  properties: {
    x: { type: "number" },
    y: { type: "number" },
    width: { type: "number" },
    height: { type: "number" },
  },
} as const;

const stringField = (nullable = false) => ({
  type: "object",
  required: ["value", "confidence"],
  properties: {
    value: nullable ? { type: ["string", "null"] } : { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    source_bbox: bboxJsonSchema,
  },
});

const numberField = (nullable = false) => ({
  type: "object",
  required: ["value", "confidence"],
  properties: {
    value: nullable ? { type: ["number", "null"] } : { type: "number" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    source_bbox: bboxJsonSchema,
  },
});

export const EXTRACT_RECEIPT_TOOL = {
  name: "extract_receipt",
  description:
    "Extract structured data from a single receipt or invoice image. " +
    "Return every required field. For uncertain or unreadable fields, return null and a low confidence score — do NOT guess.",
  input_schema: {
    type: "object",
    required: ["merchant_name", "tax_id", "date", "invoice_number", "total_amount", "tax_amount", "subtotal", "currency", "category", "items", "notes"],
    properties: {
      merchant_name: stringField(false),
      tax_id: {
        ...stringField(true),
        description: "Taiwan unified business number (統一編號): exactly 8 digits, or null if absent/unreadable.",
      },
      date: {
        ...stringField(false),
        description: "Transaction date in ISO 8601 format (YYYY-MM-DD). Convert ROC year (民國) to AD year.",
      },
      invoice_number: {
        ...stringField(true),
        description: "Taiwan invoice number format: 2 uppercase letters + 8 digits, e.g. 'AB-12345678'. Null if not a 統一發票.",
      },
      total_amount: numberField(false),
      tax_amount: numberField(true),
      subtotal: numberField(true),
      currency: {
        ...stringField(false),
        description: "ISO 4217 currency code. Default to 'TWD' if not explicitly stated.",
      },
      category: {
        type: "object",
        required: ["value", "confidence"],
        properties: {
          value: { type: "string", enum: [...CATEGORIES] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        description: "Best-guess expense category.",
      },
      items: {
        type: "array",
        description: "Line items. Empty array if not itemized.",
        items: {
          type: "object",
          required: ["name", "quantity", "unit_price", "amount"],
          properties: {
            name: { type: "string" },
            quantity: { type: ["number", "null"] },
            unit_price: { type: ["number", "null"] },
            amount: { type: ["number", "null"] },
          },
        },
      },
      notes: { type: ["string", "null"] },
    },
  },
} as const;
