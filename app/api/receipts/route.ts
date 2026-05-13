import { createClient } from "@/lib/supabase/server";
import { routedExtract } from "@/lib/ai/router";
import { isValidTaxId } from "@/lib/validation/tax-id";
import { isValidInvoiceNumber, normalizeInvoiceNumber } from "@/lib/validation/invoice-number";
import { checkAmountConsistency } from "@/lib/validation/amount";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;
const STORAGE_BUCKET = "receipts";

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function extFromMime(mime: string): string {
  return EXT_BY_MIME[mime.toLowerCase()] ?? "bin";
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    const dailyMax = Number(process.env.DAILY_UPLOAD_LIMIT ?? 200);
    const rl = rateLimit(`user:${user.id}`, dailyMax);
    if (!rl.ok) {
      return Response.json(
        {
          error: `Daily upload limit of ${dailyMax} reached. Resets at ${new Date(rl.resetAt).toISOString()}.`,
          resetAt: rl.resetAt,
        },
        { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
      );
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return Response.json({ error: "Content-Type must be multipart/form-data" }, { status: 415 });
    }

    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File)) {
      return Response.json({ error: "missing 'image' field" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return Response.json({ error: `image exceeds ${MAX_BYTES} bytes` }, { status: 413 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const mediaType = file.type || "image/jpeg";
    const imageBase64 = buf.toString("base64");

    const { data: created, error: insertErr } = await supabase
      .from("receipts")
      .insert({
        user_id: user.id,
        image_url: "",
        status: "processing",
      })
      .select("id")
      .single();
    if (insertErr || !created) {
      return Response.json({ error: insertErr?.message ?? "insert failed" }, { status: 500 });
    }
    const receiptId = created.id as string;
    const storagePath = `${user.id}/${receiptId}.${extFromMime(mediaType)}`;

    const { error: uploadErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buf, { contentType: mediaType, upsert: false });
    if (uploadErr) {
      await supabase
        .from("receipts")
        .update({ status: "error", error_message: `storage: ${uploadErr.message}` })
        .eq("id", receiptId);
      return Response.json({ error: `storage upload failed: ${uploadErr.message}` }, { status: 500 });
    }

    await supabase.from("receipts").update({ image_url: storagePath }).eq("id", receiptId);

    try {
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

      const { data: updated, error: updateErr } = await supabase
        .from("receipts")
        .update({
          status: "done",
          raw_extraction: {
            data: result.data,
            validations,
            router_path: result.router_path,
            router_attempt: result.router_attempt ?? null,
            usage: result.usage,
          },
          model_used: result.model,
          processing_ms: result.processing_ms,
          token_cost_usd: result.cost_usd,
        })
        .eq("id", receiptId)
        .select("*")
        .single();
      if (updateErr || !updated) {
        return Response.json({ error: updateErr?.message ?? "update failed" }, { status: 500 });
      }

      const { data: signed } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(storagePath, 60 * 60);

      return Response.json({ receipt: updated, image_signed_url: signed?.signedUrl ?? null });
    } catch (extractErr) {
      const message = extractErr instanceof Error ? extractErr.message : "extract failed";
      await supabase
        .from("receipts")
        .update({ status: "error", error_message: message })
        .eq("id", receiptId);
      return Response.json({ error: message, receipt_id: receiptId }, { status: 500 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const url = new URL(request.url);

    const scope = url.searchParams.get("scope");
    const status = url.searchParams.get("status");
    const search = url.searchParams.get("q");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
    const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);

    let userId: string | null = null;
    if (scope === "demo") {
      userId = process.env.NEXT_PUBLIC_DEMO_USER_ID ?? "00000000-0000-0000-0000-0000000d3000";
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return Response.json({ error: "unauthorized" }, { status: 401 });
      }
      userId = user.id;
    }

    let query = supabase
      .from("receipts")
      .select("*", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq("status", status);
    if (search) {
      const ilike = `%${search}%`;
      query = query.or(
        `raw_extraction->data->merchant_name->>value.ilike.${ilike},raw_extraction->data->tax_id->>value.ilike.${ilike},raw_extraction->data->invoice_number->>value.ilike.${ilike}`
      );
    }

    const { data, error, count } = await query;
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ receipts: data ?? [], total: count ?? 0, limit, offset });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
