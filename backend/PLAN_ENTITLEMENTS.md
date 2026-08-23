# Xcr8 plan enforcement

The backend is the source of truth for plans, quotas, credits, and entitlements. Frontend checks are only for presentation.

## Monthly entitlements

| Plan | Credits | Text | Images | High quality | Voiceovers | Creator profiles | Social accounts | Scheduled posts | Storage |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Free | 500 | 50 | 0 | 0 | 0 | 0 | 1 | 10 | 200 MiB |
| Starter | 5,000 | 500 | 25 | 0 | 10 | 0 | 3 | 100 | 2 GiB |
| Pro | 15,000 | 2,500 | 100 | 10 | 50 | 0 | 7 | 500 | 10 GiB |
| Business | 50,000 | 10,000 | 300 | 50 | 200 | 5 | 20 | 2,000 | 50 GiB |

Pro's high-quality allowance is 10 per month and Business is capped at 50 per month to protect unit economics.

## Regional pricing

| Plan | Global monthly | Global annual | Nigeria monthly | Nigeria annual |
| --- | ---: | ---: | ---: | ---: |
| Free | $0 | $0 | ₦0 | ₦0 |
| Starter | $9 | $90 | ₦7,500 | ₦75,000 |
| Pro | $29 | $290 | ₦20,000 | ₦200,000 |
| Business | $99 | $990 | ₦50,000 | ₦500,000 |

Vercel's `X-Vercel-IP-Country` header selects the display catalog. Nigerian requests receive NGN pricing; other requests receive USD pricing. Regional display is not a payment security boundary: the verified webhook must match the exact configured amount, currency, and billing cycle.

Credit costs are also centralized:

- Text generation: 5 credits
- Standard image: 100 credits
- High-quality image: 250 credits
- Voiceover audio: 50 credits
- Scheduling: 0 credits (the monthly schedule quota still applies)

Both the feature quota and the shared credit balance are hard limits.

## Required production secrets

- `BILLING_WEBHOOK_SECRET`: verifies paid plan activation.
- `AI_INTERNAL_TOKEN`: protects the internal AI microservice. Until separately configured, the services can use `OAUTH_STATE_SECRET` or `CRON_SECRET` as the shared fallback.

## Verified payment webhook

Direct requests to `POST /api/v1/plans/upgrade` always return 403. A paid plan is activated only through:

`POST /api/v1/plans/webhook/{provider}`

Send the exact raw JSON body with header:

`X-Xcr8-Signature: sha256=<hex HMAC-SHA256 of raw body using BILLING_WEBHOOK_SECRET>`

Required payload:

```json
{
  "event_id": "provider-unique-event-id",
  "user_id": 123,
  "plan": "starter",
  "status": "paid",
  "currency": "USD",
  "billing_cycle": "monthly",
  "amount_minor": 900,
  "customer_id": "optional",
  "subscription_id": "optional",
  "expires_at": "optional ISO-8601 timestamp"
}
```

Allowed paid statuses are `paid`, `succeeded`, `active`, and `completed`. Currency must be `USD` or `NGN`; billing cycle must be `monthly` or `annual`; and `amount_minor` must exactly match the central catalog. Webhook event IDs are idempotent.

## Atomic accounting

A database row lock on the user serializes monthly usage changes. Each accepted deduction updates the monthly usage row and appends an immutable usage-ledger row in the same transaction. Client `Idempotency-Key` values are namespaced by user and resource so retries do not deduct twice.

Storage is reserved before a signed upload URL is returned. Existing files created before this system need a one-time reconciliation if they should count toward the new storage limit.
