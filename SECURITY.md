# Security & Privacy Notes

> This is a portfolio project with a **public live demo** at
> <https://scanbook-three.vercel.app>. Visitors can self-register and
> upload receipts; uploads land in the author's Supabase project and
> consume the author's OpenRouter credits. This document explains what
> is and isn't protected.

## Threat model

| Asset | Threat | Mitigation |
|---|---|---|
| User PII in receipts (names, addresses, card last-4, item lists) | Anyone signs up + uploads someone else's receipt, the author sees it via admin view | RLS isolates users from each other; only the author (service-role) sees the full table. Privacy notice on landing page sets expectations. |
| OpenRouter API credits | Malicious user runs many uploads to drain credits | (1) Daily upload limit per user (default 200, env-tunable). (2) Lifetime upload cap per user (default 30, env-tunable). (3) Image SHA-256 dedup — same bytes → 409, no Claude call. (4) Haiku-first router minimizes typical cost. |
| Supabase Storage quota (1 GB Free tier) | Same as above, bytes-wise | Same mitigations; plus client-side compression to ≤1 MB before upload. |
| Storage bucket pollution | Random NSFW / illegal / off-topic image uploads sit forever | **Not mitigated.** No upload moderation. Author should periodically audit and delete via Supabase Storage UI. |
| Receipt duplication | Same receipt re-uploaded inflates counts and burns API | Image-hash dedup (DB unique index `(user_id, image_hash)` + route-level check). Invoice-number soft warning shown on receipt detail page when the same invoice number appears in another row. |
| Session hijack | Stolen access token → user sees other user's receipts | Supabase session cookies are HttpOnly + SameSite. RLS would still scope access correctly even if cookie were taken. |
| Email harvesting | Anyone can submit emails through signup form | Supabase rate-limits signups per IP. Author is on free tier — accept the noise; emails sit in `auth.users`. |
| `/api/receipts` 10s function timeout (Vercel Hobby) | Long-running Claude call gets killed | Hobby observed sufficient so far; if it stops being enough, upgrade to Pro (`vercel.json` already pins `maxDuration: 60`). |
| Secret leakage | `SUPABASE_SERVICE_ROLE_KEY` / `ANTHROPIC_API_KEY` exposed | All secrets are server-side only. `.env.local` is gitignored. `NEXT_PUBLIC_*` vars are not secret by design. No secrets in client bundles. |

## What's enforced where

| Layer | Enforcement |
|---|---|
| Browser | Client-side image compression to ≤1 MB before upload |
| Vercel edge / proxy.ts | Supabase auth session refresh on every navigation |
| Route handler | Auth check, daily rate limit, lifetime cap, image-hash dedup |
| Postgres RLS | Row-level access scoping per `user_id`; demo rows world-readable |
| Postgres unique index | `(user_id, image_hash)` where status ≠ 'error' (defense-in-depth dedup) |
| Storage RLS | Owner-scoped reads and writes; demo path public-read |

## Known unmitigated risks

- **No upload content moderation.** A determined uploader can put any image into the author's Storage bucket. Storage is private so only the author and the uploader see it, but the author has to manually clean up. Adding a moderation step (Anthropic image moderation, AWS Rekognition, etc.) is a v2 task.
- **`.env.local` leak in dev.** Saving the file triggers a Claude Code hook that shows the diff in the next user prompt's system context. Tracked in the author's personal memory as a known dev-loop quirk; values rotate after deploy.
- **In-memory rate limit** does not survive function cold-starts and is per-instance. Multi-instance Vercel deployments effectively multiply the cap. For production-grade rate limiting, swap to Upstash Redis or Vercel KV.
- **xlsx package** has a known prototype-pollution CVE. Acceptable for a portfolio export feature; swap to `exceljs` before any paid-customer rollout.

## Data deletion / DSR

Any signed-in user can delete their own receipts from the receipt detail page (DELETE button). The author can delete any user's data via Supabase admin UI (`Authentication → Users → ... → Delete`). No automated retention policy; emails and `auth.users` rows persist until manually deleted.

## Reporting

Found something? Open an issue at <https://github.com/nncu77/-scanbook/issues>.
