import "dotenv/config";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { extractReceipt } from "../lib/ai/extract-receipt";
import { computeCostUsd } from "../lib/ai/router";
import { normalizeInvoiceNumber } from "../lib/validation/invoice-number";

interface GroundTruthEntry {
  image: string;
  demo?: boolean;
  expected: {
    merchant_name: string;
    tax_id: string | null;
    date: string;
    invoice_number: string | null;
    subtotal: number | null;
    tax_amount: number | null;
    total_amount: number;
    currency: string;
    category: string;
    notes?: string | null;
  };
}

type FieldKey = keyof GroundTruthEntry["expected"];
const FIELDS: FieldKey[] = [
  "merchant_name",
  "tax_id",
  "date",
  "invoice_number",
  "subtotal",
  "tax_amount",
  "total_amount",
  "currency",
  "category",
];

function compare(field: FieldKey, extracted: unknown, expected: unknown): boolean {
  if (expected === null || expected === undefined) {
    return extracted === null || extracted === undefined;
  }
  if (extracted === null || extracted === undefined) return false;
  if (field === "subtotal" || field === "tax_amount" || field === "total_amount") {
    return Math.abs(Number(extracted) - Number(expected)) <= 1;
  }
  if (field === "invoice_number") {
    return normalizeInvoiceNumber(String(extracted)) === normalizeInvoiceNumber(String(expected));
  }
  if (field === "merchant_name") {
    return String(extracted).trim().toLowerCase() === String(expected).trim().toLowerCase();
  }
  return String(extracted) === String(expected);
}

function mimeFor(filename: string): string {
  if (filename.endsWith(".png")) return "image/png";
  if (filename.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const here = path.dirname(__filename);
  const projectRoot = path.resolve(here, "..");
  const truthPath = path.join(here, "ground-truth.json");

  if (!existsSync(truthPath)) {
    console.error(`Missing ${truthPath}`);
    process.exit(1);
  }
  const entries: GroundTruthEntry[] = JSON.parse(await readFile(truthPath, "utf8"));
  if (entries.length === 0) {
    console.log("Ground truth is empty. Add entries and try again.");
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set.");
    process.exit(1);
  }

  const counts: Record<FieldKey, { correct: number; total: number }> = {} as Record<FieldKey, { correct: number; total: number }>;
  for (const f of FIELDS) counts[f] = { correct: 0, total: 0 };
  const perImage: Array<{
    image: string;
    model: string;
    processing_ms: number;
    cost_usd: number | null;
    fields: Record<FieldKey, boolean>;
  }> = [];
  let totalMs = 0;
  let totalCostUsd = 0;
  const modelCounts: Record<string, number> = {};

  for (const entry of entries) {
    const imagePath = path.join(here, "images", entry.image);
    if (!existsSync(imagePath)) {
      console.warn(`SKIP ${entry.image} (file not found)`);
      continue;
    }
    const buf = await readFile(imagePath);
    const mediaType = mimeFor(entry.image);
    const base64 = buf.toString("base64");

    process.stdout.write(`${entry.image}: `);
    let result;
    try {
      result = await extractReceipt({ base64, mediaType });
    } catch (e) {
      console.log(`FAILED — ${e instanceof Error ? e.message : e}`);
      continue;
    }
    const cost = computeCostUsd(result.model, result.usage);
    totalMs += result.processing_ms;
    if (cost) totalCostUsd += cost;
    modelCounts[result.model] = (modelCounts[result.model] ?? 0) + 1;

    const fields: Record<FieldKey, boolean> = {} as Record<FieldKey, boolean>;
    const dataAsRecord = result.data as unknown as Record<string, { value: unknown }>;
    for (const f of FIELDS) {
      const e = dataAsRecord[f]?.value ?? null;
      const exp = entry.expected[f] ?? null;
      const ok = compare(f, e, exp);
      fields[f] = ok;
      if (ok) counts[f].correct++;
      counts[f].total++;
    }
    perImage.push({
      image: entry.image,
      model: result.model,
      processing_ms: result.processing_ms,
      cost_usd: cost,
      fields,
    });
    const correctCount = Object.values(fields).filter(Boolean).length;
    console.log(
      `${result.model} ${result.processing_ms}ms ${cost == null ? "—" : `$${cost.toFixed(4)}`} ${correctCount}/${FIELDS.length}`
    );
  }

  const accuracy_metrics: Record<FieldKey, { correct: number; total: number; accuracy: number }> = {} as Record<FieldKey, { correct: number; total: number; accuracy: number }>;
  for (const f of FIELDS) {
    const { correct, total } = counts[f];
    accuracy_metrics[f] = { correct, total, accuracy: total === 0 ? 0 : correct / total };
  }
  const avgMs = perImage.length === 0 ? 0 : Math.round(totalMs / perImage.length);

  console.log("\n=== Summary ===");
  for (const f of FIELDS) {
    const m = accuracy_metrics[f];
    console.log(`  ${f.padEnd(18)} ${m.correct}/${m.total} (${(m.accuracy * 100).toFixed(1)}%)`);
  }
  console.log(`  Avg time:   ${avgMs} ms`);
  console.log(`  Total cost: $${totalCostUsd.toFixed(4)}`);
  console.log("  Models:    ", modelCounts);

  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { error } = await supabase.from("eval_runs").insert({
      test_set_version: process.env.SCANBOOK_TEST_SET_VERSION ?? "v1",
      accuracy_metrics,
      avg_processing_ms: avgMs,
      total_cost_usd: totalCostUsd,
      notes: `n=${perImage.length}, ${JSON.stringify(modelCounts)}`,
    });
    if (error) console.warn("  eval_runs insert failed:", error.message);
    else console.log("  Wrote eval_runs row.");
  } else {
    console.log("  (Skipped eval_runs insert: SUPABASE_SERVICE_ROLE_KEY not set)");
  }

  await mkdir(path.join(projectRoot, "eval-results"), { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const reportPath = path.join(projectRoot, "eval-results", `${date}.md`);
  let md = `# Eval run ${date}\n\nn = ${perImage.length}\n\n## Per-field accuracy\n\n| Field | Correct | Total | Accuracy |\n|---|---|---|---|\n`;
  for (const f of FIELDS) {
    const m = accuracy_metrics[f];
    md += `| ${f} | ${m.correct} | ${m.total} | ${(m.accuracy * 100).toFixed(1)}% |\n`;
  }
  md += `\n## Cost & performance\n\n- Avg processing: ${avgMs} ms\n- Total cost: $${totalCostUsd.toFixed(4)}\n- Model usage: ${JSON.stringify(modelCounts)}\n\n## Per-image\n\n| Image | Model | Time | Cost | Correct fields |\n|---|---|---|---|---|\n`;
  for (const r of perImage) {
    const correctCount = Object.values(r.fields).filter(Boolean).length;
    md += `| ${r.image} | ${r.model} | ${r.processing_ms}ms | ${r.cost_usd == null ? "—" : `$${r.cost_usd.toFixed(4)}`} | ${correctCount}/${FIELDS.length} |\n`;
  }
  await writeFile(reportPath, md);
  console.log(`  Wrote ${path.relative(projectRoot, reportPath)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
