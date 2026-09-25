# Pulse usage and cost pilot

This extends the existing Pulse admin console and AI provider routing. It does not replace Pulse,
change subscription pricing, upgrade Supabase, or run billable AI calls during validation.

## Deployment (manual)

1. Recover Supabase first. Keep `PULSE_USAGE_ENABLED=false` until the following steps are complete.
2. Back up the database. With backend dependencies installed, run from the repository root:
   `python scripts/migrate_pulse_usage.py`. It reads `PULSE_DATABASE_URL` or `DATABASE_URL`.
   Use the same Supabase PostgreSQL database as the application, with a server-only owner role.
   Migration 001 is additive and repeatable. It creates four tables with reporting indexes and an initial observe
   policy, enables RLS and revokes access from Supabase `anon` and `authenticated` roles. There are
   deliberately no browser RLS policies. Do not give frontend clients database credentials.
3. Set a random `PULSE_SESSION_SECRET` of at least 32 characters on the backend. Keep it server-side.
   The existing `AI_INTERNAL_TOKEN` must be configured on both backend and AI services.
4. Set `PULSE_USAGE_ENABLED=true` on **both** Python services. On the combined Render service these
   environment variables are shared. Set `PULSE_DATABASE_URL` only if a dedicated connection URL is
   needed; it must resolve to the same database for both processes. No secret uses a `NEXT_PUBLIC_` key.
5. Deploy, sign out and sign in again. Successful existing login/verified signup flows issue a
   one-day HttpOnly, SameSite=Lax usage session cookie. Production cookies are Secure. Legacy
   `GET /auth/session/{id}` cannot mint credentials. User IDs in request bodies/headers must match
   the verified session. Local same-origin development works over HTTP; direct cross-origin API mode
   is not supported for the usage pilot.
6. Open Admin → Usage & costs (`/admin/dashboard/pulse/costs`). Configure rates and budgets below.
   Start with `mode: observe`. Review a small group of real pilot users before choosing enforce mode.
   Observation still refuses paid calls when a durable request/attempt cannot be recorded.

## Rates and budget configuration

Amounts in `limits`, `user_limits`, and `feature_limits` are **integer USD microdollars**:
1 USD = 1,000,000. Empty scope limits mean uncapped; zero means no further estimated spend allowed.
Periods are UTC calendar day, Monday-start week and calendar month. A per-user entry replaces the
default user's complete limit set. Use the actual model names configured on the AI service.

The initial catalog starts empty intentionally. Unknown usage is never displayed as free. A verified
ready-to-paste text-model catalog is in `docs/pulse-price-catalog.example.json`; review it against the
current provider pages and the exact deployed model names before saving it. Add image and speech rates
only after choosing their size, quality, and voice settings. Supported fields:

- `input_per_million`, `output_per_million`: USD per million text tokens. Reported prompt tokens are
  charged at the full input rate; cache discounts are not modeled, so calculations can overestimate.
- `per_character`: USD per speech-input character; a **planning estimate**, not a provider invoice.
- `per_image`: USD per image; configure a conservative price covering the sizes/qualities the app
  allows. This pilot does not implement image token modality or quality-specific invoice reconciliation.
- `source`, `effective_date`: source and date of the rate used. Every attempt snapshots its rate.

Example limits (illustrative, not a pricing recommendation):

```json
{
  "mode": "observe",
  "prices": {},
  "limits": {"day": 2000000, "week": 10000000, "month": 30000000},
  "user_limits": {"default": {"day": 100000, "month": 1000000}},
  "feature_limits": {"image_generate": {"day": 500000}},
  "max_output_tokens": 2048,
  "max_input_bytes": 64000
}
```

Enforce mode rejects unknown rates with a friendly 503, exhausted caps with 429, and oversized text
with 413 before the provider call. Text output is bounded and admission conservatively estimates
input tokens from serialized UTF-8 bytes. Monetary limits are **estimated-cost admission controls**,
not contractual provider billing guarantees. Image/speech estimates and provider accounting can differ.
Reservations include pending and uncertain failed calls. SDK automatic retries are disabled for
metered calls; primary OpenAI, compatibility-model and DeepSeek attempts are separate records.

Admission uses a short transaction on one policy row, serializing budget decisions across workers.
Provider network calls never run inside that lock. This favors correctness for a small pilot; profile
contention before a larger rollout. Policy saves use optimistic revisions to avoid lost admin edits.

## Ledger and reporting semantics

- `pulse_ai_requests`: one backend AI-service invocation, user, feature, status, duration. Distribution
  can make several invocations (language detection and each platform adaptation).
- `pulse_ai_attempts`: each instrumented provider call, model/provider, fallback, units, duration,
  outcome, rate snapshot, calculated/estimated cost, and retained reservation. No prompts, responses,
  API keys, email addresses, or raw upstream error strings are stored.
- `pulse_value_events`: deduplicated generated outputs, client-reported image/audio downloads (including
  image history), and server-confirmed publishing. A browser download click is not proof of a saved file.
  Publishing is counted once per post/platform across direct and scheduled publishing and is currently
  reported under publishing, not falsely attributed to a specific AI generation. Old gallery items
  without usage IDs do not produce attributed downloads. Local image enhancement is not a paid AI call.
- `pulse_cost_policy`: admin-only current price catalog and caps.

Dashboard spend uses known costs, explicitly reports unknown/pending attempts and unresolved reserves,
and counts active AI users as distinct users with a successful invocation in the selected period.
Cost per active user is null for an empty denominator. Feature and top-user lists cover this month;
top users are user IDs (no extra joins or Supabase Auth enumeration). Refresh is manual, avoiding
continuous polling and extra background database work. The health endpoint stays database-independent.

## Failure handling and reconciliation

Database unavailable before admission: no paid provider call; controlled 503. If settlement fails after
a provider call, the durable pending row/reservation remains and the server emits its ID for reconciliation.
Do not delete/release these reservations automatically: a timed-out call may have been billed. Compare
provider records before an operator adjusts uncertain entries. Unknown failed calls remain unknown,
not zero. A failed publication-event write does not retry publishing; reconcile it from existing posts
and publishing logs. Database outages can delay value tracking. Full durable event replay is not provided.

The pilot requires ordinary Supabase write availability; it cannot restore an unhealthy Supabase project.
No historical spend is fabricated or backfilled from old generation text. Metrics start at enablement.

## Validation and local pilot

```sh
pip install -r backend/requirements.txt -r ai-services/requirements.txt pytest
PYTHONPATH=backend pytest -q backend/tests
python -m compileall backend/app ai-services/app shared
pnpm --filter @xcr8/frontend typecheck
pnpm --filter @xcr8/frontend build
python scripts/pilot_pulse_usage.py --output work/pulse-pilot.json
```

The pilot command uses a temporary SQLite database, fake providers and clearly labeled synthetic rates;
it never sends a paid AI request or writes production data. Review known cost, unknown failed-attempt
reservations, DeepSeek fallback, value events, budget rejection and per-user allocation. A production
PostgreSQL migration/concurrency smoke check and real small-user observation period remain manual
until Supabase recovers. Reconcile sample invoices before deciding pricing or enabling enforcement.

Rollback: set `PULSE_USAGE_ENABLED=false` on both services and redeploy. Keep the additive tables for
audit. Disabling also disables the new caps; existing plan entitlements remain. Re-enable with the same
session secret or require users to sign in again after rotating it. Never drop the tables as a rollback.
