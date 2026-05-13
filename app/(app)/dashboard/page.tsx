import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DEMO_UUID = process.env.NEXT_PUBLIC_DEMO_USER_ID ?? "00000000-0000-0000-0000-0000000d3000";
const CATEGORIES = ["餐飲", "交通", "辦公", "住宿", "其他"] as const;

type ExtractedField<T> = { value: T; confidence: number };
type ExtractionData = {
  merchant_name?: ExtractedField<string>;
  date?: ExtractedField<string>;
  total_amount?: ExtractedField<number>;
  currency?: ExtractedField<string>;
  tax_id?: ExtractedField<string | null>;
  invoice_number?: ExtractedField<string | null>;
  category?: ExtractedField<string>;
};
type ReceiptRow = {
  id: string;
  status: string;
  raw_extraction: { data?: ExtractionData } | null;
  corrected_data: ExtractionData | null;
  token_cost_usd: string | number | null;
  model_used: string | null;
  created_at: string;
};

function fmtAmount(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount == null) return "—";
  return `${currency ?? "TWD"} ${amount.toLocaleString()}`;
}

function StatusBadge({ status }: { status: string }) {
  const map = {
    pending: { variant: "outline" as const, label: "Pending" },
    processing: { variant: "secondary" as const, label: "Processing" },
    done: { variant: "default" as const, label: "Done" },
    error: { variant: "destructive" as const, label: "Error" },
    reviewed: { variant: "default" as const, label: "Reviewed" },
  };
  const cfg = map[status as keyof typeof map] ?? { variant: "outline" as const, label: status };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

const STATUS_FILTERS: { value: string | null; label: string }[] = [
  { value: null, label: "All" },
  { value: "done", label: "Done" },
  { value: "reviewed", label: "Reviewed" },
  { value: "processing", label: "Processing" },
  { value: "error", label: "Errors" },
];

function buildHref(args: {
  demo: boolean;
  status?: string | null;
  q?: string | null;
  from?: string | null;
  to?: string | null;
  category?: string | null;
  min?: string | null;
  max?: string | null;
}): string {
  const params = new URLSearchParams();
  if (args.demo) params.set("demo", "true");
  if (args.status) params.set("status", args.status);
  if (args.q) params.set("q", args.q);
  if (args.from) params.set("from", args.from);
  if (args.to) params.set("to", args.to);
  if (args.category) params.set("category", args.category);
  if (args.min) params.set("min", args.min);
  if (args.max) params.set("max", args.max);
  const qs = params.toString();
  return qs ? `/dashboard?${qs}` : "/dashboard";
}

function exportHref(format: "csv" | "xlsx", args: { status?: string; from?: string; to?: string }): string {
  const params = new URLSearchParams({ format });
  if (args.status) params.set("status", args.status);
  if (args.from) params.set("from", args.from);
  if (args.to) params.set("to", args.to);
  return `/api/export?${params.toString()}`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    demo?: string;
    status?: string;
    q?: string;
    from?: string;
    to?: string;
    category?: string;
    min?: string;
    max?: string;
  }>;
}) {
  const { demo, status, q, from, to, category, min, max } = await searchParams;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10">
        <Card>
          <CardHeader><CardTitle>Supabase not configured</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Copy <code>.env.local.example</code> to <code>.env.local</code> and set{" "}
            <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
          </CardContent>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isDemo = demo === "true" || !user;

  if (!user && demo !== "true") redirect("/login");

  const targetUserId = isDemo ? DEMO_UUID : user!.id;

  let query = supabase
    .from("receipts")
    .select("*", { count: "exact" })
    .eq("user_id", targetUserId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (status) query = query.eq("status", status);
  if (q && q.trim()) {
    const ilike = `%${q.trim()}%`;
    query = query.or(
      `raw_extraction->data->merchant_name->>value.ilike.${ilike},raw_extraction->data->tax_id->>value.ilike.${ilike},raw_extraction->data->invoice_number->>value.ilike.${ilike}`
    );
  }
  if (from) query = query.gte("raw_extraction->data->date->>value", from);
  if (to) query = query.lte("raw_extraction->data->date->>value", to);
  if (category) query = query.filter("raw_extraction->data->category->>value", "eq", category);

  const { data, error, count } = await query;
  let receipts = (data ?? []) as ReceiptRow[];

  // Amount filter is post-fetch (jsonb->>text doesn't sort numerically).
  if (min || max) {
    const minN = min ? Number(min) : null;
    const maxN = max ? Number(max) : null;
    receipts = receipts.filter((r) => {
      const t =
        r.corrected_data?.total_amount?.value ??
        r.raw_extraction?.data?.total_amount?.value ??
        null;
      if (t == null) return false;
      if (minN != null && t < minN) return false;
      if (maxN != null && t > maxN) return false;
      return true;
    });
  }

  const hasFilters = !!(q || from || to || category || min || max);
  const totalDb = count ?? 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isDemo ? "Demo dashboard" : "Your receipts"}
          </h1>
          {isDemo && (
            <p className="text-sm text-muted-foreground">
              Browsing pre-loaded demo receipts.{" "}
              <Link href="/signup" className="underline">Sign up</Link> to scan your own.
            </p>
          )}
        </div>
        {!isDemo && (
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={exportHref("csv", { status, from, to })}
              className={buttonVariants({ variant: "outline", size: "sm" })}
              prefetch={false}
            >
              Export CSV
            </Link>
            <Link
              href={exportHref("xlsx", { status, from, to })}
              className={buttonVariants({ variant: "outline", size: "sm" })}
              prefetch={false}
            >
              Export Excel
            </Link>
            <Link href="/scan" className={buttonVariants({ size: "sm" })}>+ Scan</Link>
          </div>
        )}
      </div>

      <form method="get" className="grid sm:grid-cols-2 lg:grid-cols-6 gap-3 border rounded-md p-3 bg-card items-end">
        {isDemo && <input type="hidden" name="demo" value="true" />}
        {status && <input type="hidden" name="status" value={status} />}
        <div className="lg:col-span-2 space-y-1">
          <Label htmlFor="q" className="text-xs uppercase text-muted-foreground">Search</Label>
          <Input id="q" name="q" defaultValue={q ?? ""} placeholder="Merchant, 統編, invoice #" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="category" className="text-xs uppercase text-muted-foreground">Category</Label>
          <select
            id="category"
            name="category"
            defaultValue={category ?? ""}
            className="border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs"
          >
            <option value="">All</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="from" className="text-xs uppercase text-muted-foreground">From</Label>
          <Input id="from" name="from" type="date" defaultValue={from ?? ""} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to" className="text-xs uppercase text-muted-foreground">To</Label>
          <Input id="to" name="to" type="date" defaultValue={to ?? ""} />
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <div className="space-y-1">
            <Label htmlFor="min" className="text-xs uppercase text-muted-foreground">Min</Label>
            <Input id="min" name="min" type="number" inputMode="decimal" step="1" defaultValue={min ?? ""} placeholder="Min" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="max" className="text-xs uppercase text-muted-foreground">Max</Label>
            <Input id="max" name="max" type="number" inputMode="decimal" step="1" defaultValue={max ?? ""} placeholder="Max" />
          </div>
        </div>
        <div className="flex gap-2 items-end justify-end">
          <Button type="submit" size="sm">Apply</Button>
          {hasFilters && (
            <Link
              href={buildHref({ demo: isDemo, status })}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Clear
            </Link>
          )}
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex flex-wrap gap-3">
          {STATUS_FILTERS.map((f) => {
            const href = buildHref({ demo: isDemo, status: f.value, q, from, to, category, min, max });
            const active = (status ?? null) === f.value;
            return (
              <Link
                key={f.label}
                href={href}
                className={active ? "font-semibold underline" : "text-muted-foreground hover:text-foreground"}
              >
                {f.label}
              </Link>
            );
          })}
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {hasFilters
            ? `Showing ${receipts.length} (filtered from ${totalDb})`
            : `${totalDb} receipt${totalDb === 1 ? "" : "s"}`}
        </span>
      </div>

      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {receipts.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {isDemo
              ? "No demo receipts to show. Run npm run seed to populate, or your filter excluded all of them."
              : hasFilters
                ? "No receipts match your filters."
                : "No receipts. Scan one to get started."}
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Merchant</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receipts.map((r) => {
                const d = r.corrected_data ?? r.raw_extraction?.data ?? null;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="tabular-nums">{d?.date?.value ?? "—"}</TableCell>
                    <TableCell>{d?.merchant_name?.value ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{d?.category?.value ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtAmount(d?.total_amount?.value, d?.currency?.value)}
                    </TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.token_cost_usd != null ? `$${Number(r.token_cost_usd).toFixed(4)}` : "—"}
                    </TableCell>
                    <TableCell>
                      <Link href={`/receipts/${r.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                        View
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
