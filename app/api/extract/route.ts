import { routedExtract } from "@/lib/ai/router";
import { isValidTaxId } from "@/lib/validation/tax-id";
import { isValidInvoiceNumber, normalizeInvoiceNumber } from "@/lib/validation/invoice-number";
import { checkAmountConsistency } from "@/lib/validation/amount";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    let imageBase64: string;
    let mediaType: string;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("image");
      if (!(file instanceof File)) {
        return Response.json({ error: "missing 'image' field" }, { status: 400 });
      }
      if (file.size > MAX_BYTES) {
        return Response.json({ error: `image exceeds ${MAX_BYTES} bytes` }, { status: 413 });
      }
      const buf = Buffer.from(await file.arrayBuffer());
      imageBase64 = buf.toString("base64");
      mediaType = file.type || "image/jpeg";
    } else if (contentType.includes("application/json")) {
      const body = (await request.json()) as { imageBase64?: unknown; mediaType?: unknown };
      if (typeof body.imageBase64 !== "string" || body.imageBase64.length === 0) {
        return Response.json({ error: "missing 'imageBase64' (base64 string)" }, { status: 400 });
      }
      if (body.imageBase64.length > MAX_BYTES * 1.4) {
        return Response.json({ error: "image too large" }, { status: 413 });
      }
      imageBase64 = body.imageBase64;
      mediaType = typeof body.mediaType === "string" ? body.mediaType : "image/jpeg";
    } else {
      return Response.json(
        { error: "Content-Type must be multipart/form-data or application/json" },
        { status: 415 }
      );
    }

    const result = await routedExtract({ base64: imageBase64, mediaType });

    const taxIdValue = result.data.tax_id.value;
    const invoiceValue = result.data.invoice_number.value;

    const validations = {
      tax_id_valid: taxIdValue === null ? null : isValidTaxId(taxIdValue),
      invoice_number_valid: invoiceValue === null ? null : isValidInvoiceNumber(invoiceValue),
      invoice_number_normalized: normalizeInvoiceNumber(invoiceValue),
      amount: checkAmountConsistency({
        subtotal: result.data.subtotal.value,
        tax_amount: result.data.tax_amount.value,
        total_amount: result.data.total_amount.value,
      }),
    };

    return Response.json({
      data: result.data,
      validations,
      router: {
        path: result.router_path,
        model: result.model,
        cost_usd: result.cost_usd,
        attempt: result.router_attempt ?? null,
      },
      processing_ms: result.processing_ms,
      usage: result.usage,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
