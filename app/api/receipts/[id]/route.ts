import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const STORAGE_BUCKET = "receipts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function fetchReceiptWithSignedUrl(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("receipts").select("*").eq("id", id).single();
  if (error || !data) return { supabase, error };
  let image_signed_url: string | null = null;
  if (data.image_url) {
    const signed = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(data.image_url, 60 * 60);
    image_signed_url = signed.data?.signedUrl ?? null;
  }
  return { supabase, receipt: data, image_signed_url };
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "invalid id" }, { status: 400 });

  const { receipt, error, image_signed_url } = await fetchReceiptWithSignedUrl(id);
  if (error) {
    const status = error.code === "PGRST116" ? 404 : 500;
    return Response.json({ error: error.message }, { status });
  }
  return Response.json({ receipt, image_signed_url });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "invalid id" }, { status: 400 });

  let body: { corrected_data?: unknown; status?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (body.corrected_data !== undefined) {
    if (typeof body.corrected_data !== "object" || body.corrected_data === null) {
      return Response.json({ error: "corrected_data must be a JSON object" }, { status: 400 });
    }
    update.corrected_data = body.corrected_data;
    update.status = "reviewed";
    update.reviewed_at = new Date().toISOString();
  }
  if (typeof body.status === "string") {
    const allowed = new Set(["pending", "processing", "done", "error", "reviewed"]);
    if (!allowed.has(body.status)) {
      return Response.json({ error: "invalid status" }, { status: 400 });
    }
    update.status = body.status;
    if (body.status === "reviewed" && !update.reviewed_at) {
      update.reviewed_at = new Date().toISOString();
    }
  }
  if (Object.keys(update).length === 0) {
    return Response.json({ error: "no fields to update" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("receipts")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();
  if (error) {
    const status = error.code === "PGRST116" ? 404 : 500;
    return Response.json({ error: error.message }, { status });
  }
  return Response.json({ receipt: data });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "invalid id" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { data: row, error: selectErr } = await supabase
    .from("receipts")
    .select("image_url")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (selectErr) {
    const status = selectErr.code === "PGRST116" ? 404 : 500;
    return Response.json({ error: selectErr.message }, { status });
  }

  if (row?.image_url) {
    await supabase.storage.from(STORAGE_BUCKET).remove([row.image_url]);
  }

  const { error: deleteErr } = await supabase
    .from("receipts")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (deleteErr) return Response.json({ error: deleteErr.message }, { status: 500 });

  return Response.json({ ok: true });
}
