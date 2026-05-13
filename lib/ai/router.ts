import { extractReceipt, type ExtractResult } from "./extract-receipt";
import type { ReceiptExtraction } from "./schema";

const PRIMARY_MODEL = process.env.SCANBOOK_PRIMARY_MODEL || "claude-sonnet-4-6";
// Haiku 4.5 has no short alias; must use the dated snapshot ID.
const ROUTER_MODEL = process.env.SCANBOOK_ROUTER_MODEL || "claude-haiku-4-5-20251001";

// USD per million tokens. Match by model-id prefix to tolerate dated snapshots.
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-opus-4-7": { input: 15.0, output: 75.0 },
};

function pricingFor(model: string) {
  // Normalize OpenRouter format ("anthropic/claude-sonnet-4.6") to direct
  // Anthropic format ("claude-sonnet-4-6") so the lookup table works for both.
  const stripped = model.includes("/") ? model.split("/")[1] : model;
  const dashed = stripped.replace(/\./g, "-");
  const key = Object.keys(PRICING).find((k) => dashed.startsWith(k));
  return key ? PRICING[key] : null;
}

export function computeCostUsd(
  model: string,
  usage: { input_tokens: number; output_tokens: number }
): number | null {
  const p = pricingFor(model);
  if (!p) return null;
  return (usage.input_tokens * p.input + usage.output_tokens * p.output) / 1_000_000;
}

export type RouterPath = "primary-only" | "router-only" | "router-escalated";

export interface RoutedResult extends ExtractResult {
  router_path: RouterPath;
  cost_usd: number | null;
  router_attempt?: { model: string; min_confidence: number; cost_usd: number | null };
}

export interface RouteOptions {
  base64: string;
  mediaType: string;
  forceModel?: "primary" | "router";
  escalateBelow?: number;
}

const REQUIRED_FIELDS = [
  "merchant_name",
  "date",
  "total_amount",
  "currency",
  "category",
] as const satisfies readonly (keyof ReceiptExtraction)[];

function minRequiredConfidence(data: ReceiptExtraction): number {
  let min = 1;
  for (const k of REQUIRED_FIELDS) {
    const v = data[k] as { confidence: number };
    if (typeof v?.confidence === "number" && v.confidence < min) min = v.confidence;
  }
  return min;
}

export async function routedExtract(opts: RouteOptions): Promise<RoutedResult> {
  const threshold = opts.escalateBelow ?? 0.6;

  if (opts.forceModel === "primary") {
    const r = await extractReceipt({
      base64: opts.base64,
      mediaType: opts.mediaType,
      model: PRIMARY_MODEL,
    });
    return { ...r, router_path: "primary-only", cost_usd: computeCostUsd(r.model, r.usage) };
  }

  const first = await extractReceipt({
    base64: opts.base64,
    mediaType: opts.mediaType,
    model: ROUTER_MODEL,
  });
  const firstMin = minRequiredConfidence(first.data);
  const firstCost = computeCostUsd(first.model, first.usage);

  if (firstMin >= threshold) {
    return { ...first, router_path: "router-only", cost_usd: firstCost };
  }

  const second = await extractReceipt({
    base64: opts.base64,
    mediaType: opts.mediaType,
    model: PRIMARY_MODEL,
  });
  const secondCost = computeCostUsd(second.model, second.usage);
  const combined =
    firstCost !== null && secondCost !== null ? firstCost + secondCost : null;

  return {
    ...second,
    processing_ms: first.processing_ms + second.processing_ms,
    router_path: "router-escalated",
    cost_usd: combined,
    router_attempt: {
      model: first.model,
      min_confidence: firstMin,
      cost_usd: firstCost,
    },
  };
}
