import { createClient } from "@/lib/supabase/server";
import { toCsv, type ReceiptRow } from "@/lib/export/csv";
import { toXlsx } from "@/lib/export/excel";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const format = (url.searchParams.get("format") ?? "csv").toLowerCase();
    const status = url.searchParams.get("status");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    let query = supabase
      .from("receipts")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return Response.json({ error: error.message }, { status: 500 });

    let rows = (data ?? []) as ReceiptRow[];
    if (from || to) {
      rows = rows.filter((r) => {
        const d =
          r.corrected_data?.date?.value ??
          r.raw_extraction?.data?.date?.value ??
          null;
        if (!d) return false;
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      });
    }

    const ts = new Date().toISOString().slice(0, 10);

    if (format === "xlsx") {
      const buf = toXlsx(rows);
      return new Response(buf, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="scanbook-${ts}.xlsx"`,
        },
      });
    }

    const csv = toCsv(rows);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv;charset=utf-8",
        "Content-Disposition": `attachment; filename="scanbook-${ts}.csv"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
