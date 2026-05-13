# ScanBook

> Snap a receipt, get structured data in 3 seconds.

**Live demo:** <https://scanbook-three.vercel.app>

AI-powered receipt and invoice digitization for Taiwanese small businesses. Mobile capture → 3-second structured output → human-in-the-loop review → CSV / Excel export.

---

## Why this project (AI engineering showcase)

This isn't "call a vision API and parse a string." It deliberately demonstrates:

1. **Structured output via tool use** — `extract_receipt` is a Claude tool with a JSON schema. The model can only respond by calling the tool, so the payload is type-safe by construction; no fragile prompt-engineered JSON parsing.
2. **Field-level confidence + human-in-the-loop** — every field carries a calibrated 0–1 confidence. The UI color-codes red / amber / green and surfaces low-confidence values for review before they hit your books.
3. **Cost-routed inference** — Haiku triages each receipt; only when the min required-field confidence drops below 0.6 does Sonnet take over. Each receipt's path + cost is logged.
4. **End-to-end evaluation pipeline** — `npm run eval` runs the extractor against a labeled set, compares field-by-field with domain-aware tolerance rules, and writes results to both Postgres and a Markdown report.
5. **Domain validation** — Taiwan 統一編號 mod-5 checksum, 統一發票 format check, subtotal+tax consistency, ROC date conversion.

## Architecture

```
Mobile / Web (PWA)
        │
        │  POST multipart image (≤1 MB after client compress)
        ▼
Next.js Route Handler — /api/receipts (POST)
        │
        │  1. auth check + per-user daily rate limit
        │  2. upload to Supabase Storage (private bucket, owner-scoped path)
        │  3. insert receipt row (status = processing)
        ▼
Router  —  lib/ai/router.ts
        │
        ├──► Haiku 4.5   ──── if min(required_conf) ≥ 0.6 ──┐
        │                                                     │
        └──► Sonnet 4.6  ◄─── on escalation                  │
                                                              │
        ┌─────────────────────────────────────────────────────┘
        ▼
Validate  —  lib/validation/*
   tax_id mod-5 · invoice format · subtotal+tax≈total
        │
        ▼
Supabase Postgres  +  RLS  +  jsonb (raw_extraction, corrected_data)
        │
        ▼
UI
   /receipts/[id]   — confidence-colored editable fields, bbox hover, items
   /dashboard       — search · date · status · category · amount range · CSV / XLSX
   /eval (public)   — per-field accuracy + live cost / router stats
```

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 16 (App Router) + TypeScript | Server components, server actions, route handlers |
| UI | Tailwind v4 + shadcn/ui (Base UI) | Fast, modern, no design debt |
| Auth & DB | Supabase | RLS, Auth, Storage, Postgres in one |
| AI | Anthropic Claude (Sonnet 4.6 + Haiku 4.5) | Vision + tool use |
| Validation | Zod 4 | Type-safe schemas |
| Export | xlsx | CSV + Excel |
| Deploy | Vercel (Pro for 60 s function timeout) | Tight Next.js integration |

## Evaluation

`/eval` is publicly viewable. Per-field accuracy is computed against a hand-labeled set in `eval-data/`. Live aggregates (cost, router path, model usage) update as production traffic accumulates.

```bash
npm run eval     # extracts from eval-data/images, writes eval_runs row + eval-results/{date}.md
```

Comparison rules:

| Field | Rule |
|---|---|
| amounts (subtotal, tax, total) | ±NT$1 tolerance |
| invoice_number | normalized form match (drops dashes) |
| merchant_name | case-folded trim equality |
| tax_id, date, category, currency | exact string equality |

## Cost engineering

Two-stage router (`lib/ai/router.ts`):

1. **Haiku 4.5** first — $1 / $5 per M input / output tokens. Most receipts clear it.
2. **Sonnet 4.6** only when min required-field confidence < 0.6 — $3 / $15 per M tokens.

Each receipt's `model_used`, `processing_ms`, `token_cost_usd`, and `router_path` is logged. `/eval` shows the live breakdown — what % of receipts escalate, and the blended per-receipt cost.

## Run locally

```bash
git clone <repo>
cd scanbook
npm install
cp .env.local.example .env.local      # fill ANTHROPIC_API_KEY + Supabase keys
npm run dev
```

### Supabase setup

1. Create a new Supabase project
2. Run `supabase/migrations/0001_init.sql` in the SQL editor
3. Create a private bucket named `receipts` in Storage
4. Apply the storage policies (commented at the bottom of the migration)
5. (Optional) Enable Google OAuth — Auth → Providers → Google; in Google Cloud, register redirect URI `https://<project>.supabase.co/auth/v1/callback`

### Demo data

```bash
npm run seed   # populates demo dashboard from eval-data/ground-truth.json entries flagged demo:true
```

The seed script reads `eval-data/ground-truth.json`, uploads any matching images from `eval-data/images/` to storage under the demo user, and inserts receipt rows with synthetic confidence so the demo UI shows a realistic mix of green / amber fields.

## Project structure

```
app/
  (auth)/                 login, signup, OAuth button
  (app)/
    scan/                 mobile camera + batch upload (up to 5 images)
    dashboard/            list + filters + export
    receipts/[id]/        viewer + editor with bbox + items
  eval/                   public metrics
  api/
    extract/              raw extraction (no DB; used by eval)
    receipts/             upload + list + CRUD
    export/               CSV / XLSX download
  auth/callback/          OAuth code exchange
  manifest.ts             PWA manifest
lib/
  ai/                     router, extract-receipt, schema, prompts
  validation/             tax-id, invoice-number, amount
  supabase/               browser, server, service-role clients
  export/                 csv, excel
  rate-limit.ts           in-memory daily bucket
proxy.ts                  Supabase auth session refresh (Next 16 — was middleware.ts)
supabase/migrations/      0001_init.sql
eval-data/                ground-truth.json + images + run-eval.ts
scripts/                  seed-demo.ts
components/               ui/ (shadcn) + theme-toggle
```

## Notes & known limits

- **`/api/receipts` POST is synchronous** (upload + Claude call ≈ 5–30 s). Vercel Hobby caps functions at 10 s, so production needs Pro for the 60 s ceiling.
- **Rate limit is in-memory** — fine for portfolio / single-instance dev. For multi-instance deploys, swap to Upstash Redis.
- **Bbox overlay is wired** but Claude vision rarely returns useful bboxes; a layout-aware OCR step would be needed for accurate boxes. The UI gracefully no-ops when bboxes are absent.
- **JSONB filter queries** on the dashboard use unindexed paths. Fine to hundreds of rows; at 10 k+ add a GIN index or denormalize.
- **xlsx package has a known prototype-pollution CVE.** Acceptable risk for portfolio; swap to `exceljs` before shipping to paying customers.
- **PWA install on Android may not prompt** because the manifest only ships an SVG icon. For full install support, add 192×192 + 512×512 PNGs to `public/` and reference them in `app/manifest.ts`.

## Roadmap (v2)

- 財政部電子發票載具 API — auto-import 電子發票 by scanning the carrier QR
- Company name auto-fill from 統編 (財政部 open data)
- Direct integration with Xero / QuickBooks / 智慧記帳 KAKEIBO
- Multi-user workspaces with role-based access
- Self-improving category classifier — fine-tune on user corrections
- Native React Native app
