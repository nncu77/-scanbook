import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type FieldMetric = { correct: number; total: number; accuracy: number };

type EvalRunRow = {
  run_date: string;
  test_set_version: string;
  accuracy_metrics: Record<string, FieldMetric>;
  avg_processing_ms: number | null;
  total_cost_usd: string | number | null;
  notes: string | null;
};

type ReceiptStatsRow = {
  model_used: string | null;
  processing_ms: number | null;
  token_cost_usd: string | number | null;
  status: string;
  raw_extraction: { router_path?: string } | null;
};

function NotConfigured({ what }: { what: string }) {
  return (
    <Card>
      <CardHeader><CardTitle>{what}</CardTitle></CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Configure your environment variables to view aggregate stats.
      </CardContent>
    </Card>
  );
}

export default async function EvalPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10">
        <NotConfigured what="Supabase service role not configured" />
      </div>
    );
  }

  const supabase = createServiceClient();

  const [{ data: runs }, { data: receipts }] = await Promise.all([
    supabase
      .from("eval_runs")
      .select("*")
      .order("run_date", { ascending: false })
      .limit(1),
    supabase
      .from("receipts")
      .select("model_used, processing_ms, token_cost_usd, status, raw_extraction")
      .limit(1000),
  ]);

  const latestRun = (runs?.[0] as EvalRunRow | undefined) ?? null;
  const rows = (receipts ?? []) as ReceiptStatsRow[];

  const total = rows.length;
  const completed = rows.filter((r) => r.status === "done" || r.status === "reviewed").length;
  const totalMs = rows.reduce((s, r) => s + (r.processing_ms ?? 0), 0);
  const avgMs = total === 0 ? 0 : Math.round(totalMs / total);
  const totalCost = rows.reduce((s, r) => s + Number(r.token_cost_usd ?? 0), 0);

  const routerPaths: Record<string, number> = {};
  const models: Record<string, number> = {};
  for (const r of rows) {
    const path = r.raw_extraction?.router_path ?? "—";
    routerPaths[path] = (routerPaths[path] ?? 0) + 1;
    if (r.model_used) models[r.model_used] = (models[r.model_used] ?? 0) + 1;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-10">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Evaluation</h1>
        <p className="text-muted-foreground mt-1">
          Field-level accuracy on a labeled test set, plus live cost & router stats from production traffic.
        </p>
      </header>

      <section>
        <h2 className="text-xl font-semibold mb-3">Latest eval run</h2>
        {!latestRun ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              No evaluation runs yet. Populate <code>eval-data/ground-truth.json</code> and run{" "}
              <code>npm run eval</code>.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
              {Object.entries(latestRun.accuracy_metrics).map(([field, m]) => (
                <Card key={field}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {field}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold tabular-nums">
                      {(m.accuracy * 100).toFixed(1)}%
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {m.correct} / {m.total} correct
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {new Date(latestRun.run_date).toLocaleString()} · {latestRun.test_set_version}
              {latestRun.avg_processing_ms != null && ` · avg ${latestRun.avg_processing_ms} ms`}
              {latestRun.total_cost_usd != null && ` · $${Number(latestRun.total_cost_usd).toFixed(4)} total`}
              {latestRun.notes && ` · ${latestRun.notes}`}
            </p>
          </>
        )}
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-3">
          Live stats <span className="text-sm font-normal text-muted-foreground">(last {Math.min(total, 1000)} receipts)</span>
        </h2>
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total receipts</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold tabular-nums">{total}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Avg processing</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold tabular-nums">{avgMs} <span className="text-base font-normal text-muted-foreground">ms</span></div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total spend</CardTitle></CardHeader>
            <CardContent><div className="text-2xl font-bold tabular-nums">${totalCost.toFixed(2)}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Completion rate</CardTitle></CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums">
                {total === 0 ? "—" : `${((completed / total) * 100).toFixed(0)}%`}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-4 grid md:grid-cols-2 gap-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle>Router path</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              {Object.keys(routerPaths).length === 0 ? (
                <span className="text-muted-foreground">No receipts yet.</span>
              ) : (
                Object.entries(routerPaths)
                  .sort(([, a], [, b]) => b - a)
                  .map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span>{k}</span>
                      <span className="tabular-nums">
                        {v} ({((v / total) * 100).toFixed(0)}%)
                      </span>
                    </div>
                  ))
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle>Model usage</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              {Object.keys(models).length === 0 ? (
                <span className="text-muted-foreground">No receipts yet.</span>
              ) : (
                Object.entries(models)
                  .sort(([, a], [, b]) => b - a)
                  .map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span className="truncate mr-2">{k}</span>
                      <span className="tabular-nums">{v}</span>
                    </div>
                  ))
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
