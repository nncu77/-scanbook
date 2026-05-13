import "dotenv/config";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

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

const DEFAULT_CONFIDENCE: Record<string, number> = {
  merchant_name: 0.95,
  tax_id: 0.78,
  date: 0.92,
  invoice_number: 0.74,
  subtotal: 0.86,
  tax_amount: 0.84,
  total_amount: 0.97,
  currency: 0.99,
  category: 0.83,
};

function field<T>(value: T, name: string): { value: T; confidence: number } {
  return { value, confidence: DEFAULT_CONFIDENCE[name] ?? 0.9 };
}

function mimeFor(filename: string): string {
  if (filename.endsWith(".png")) return "image/png";
  if (filename.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

function extFor(filename: string): string {
  return path.extname(filename).slice(1) || "jpg";
}

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
    process.exit(1);
  }
  const demoUserId =
    process.env.NEXT_PUBLIC_DEMO_USER_ID ?? "00000000-0000-0000-0000-0000000d3000";

  const __filename = fileURLToPath(import.meta.url);
  const here = path.dirname(__filename);
  const projectRoot = path.resolve(here, "..");
  const truthPath = path.join(projectRoot, "eval-data", "ground-truth.json");
  if (!existsSync(truthPath)) {
    console.error(`Missing ${truthPath}`);
    process.exit(1);
  }
  const entries: GroundTruthEntry[] = JSON.parse(await readFile(truthPath, "utf8"));
  const demoEntries = entries.filter((e) => e.demo);
  if (demoEntries.length === 0) {
    console.log('No entries with "demo": true. Nothing to seed.');
    return;
  }

  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  // Wipe existing demo rows so re-seeding is idempotent.
  const { error: clearErr } = await supabase
    .from("receipts")
    .delete()
    .eq("user_id", demoUserId);
  if (clearErr) console.warn("Couldn't clear existing demo rows:", clearErr.message);

  let inserted = 0;
  for (const entry of demoEntries) {
    const imagePath = path.join(projectRoot, "eval-data", "images", entry.image);
    const storagePath = `demo/${entry.image}`;

    if (existsSync(imagePath)) {
      const buf = await readFile(imagePath);
      const { error: uploadErr } = await supabase.storage
        .from("receipts")
        .upload(storagePath, buf, { contentType: mimeFor(entry.image), upsert: true });
      if (uploadErr) {
        console.warn(`  ${entry.image}: storage upload failed (${uploadErr.message}) — inserting row without image.`);
      }
    } else {
      console.warn(`  ${entry.image}: file not found in eval-data/images — inserting row without image.`);
    }

    const exp = entry.expected;
    const data = {
      merchant_name: field(exp.merchant_name, "merchant_name"),
      tax_id: field(exp.tax_id, "tax_id"),
      date: field(exp.date, "date"),
      invoice_number: field(exp.invoice_number, "invoice_number"),
      subtotal: field(exp.subtotal, "subtotal"),
      tax_amount: field(exp.tax_amount, "tax_amount"),
      total_amount: field(exp.total_amount, "total_amount"),
      currency: field(exp.currency, "currency"),
      category: field(exp.category, "category"),
      items: [],
      notes: exp.notes ?? null,
    };

    const { error: insertErr } = await supabase.from("receipts").insert({
      user_id: demoUserId,
      image_url: existsSync(imagePath) ? storagePath : "",
      status: "done",
      raw_extraction: { data, router_path: "router-only" },
      model_used: "claude-haiku-4-5 (seeded)",
      processing_ms: 1800,
      token_cost_usd: 0.0021,
    });
    if (insertErr) {
      console.error(`  ${entry.image}: insert failed:`, insertErr.message);
      continue;
    }
    inserted++;
    console.log(`  ${entry.image}: seeded (.${extFor(entry.image)})`);
  }
  console.log(`\nSeeded ${inserted} demo receipts under user_id=${demoUserId}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
