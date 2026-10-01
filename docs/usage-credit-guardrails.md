# XCR8 Usage-Credit Guardrails

The production usage system has two independent gates:

1. the active plan's feature allowance; and
2. the active billing period's shared credit balance.

A request must pass both gates before any billable AI provider is called.

## Configuration

Authoritative economics live in `backend/app/services/usage_config.py`:

- `PLAN_USAGE`: monthly credits and feature limits.
- `PLAN_PRICING`: plan prices.
- `CREDIT_WEIGHTS`: credit cost per billable feature.
- `WARNING_THRESHOLDS`: 75%, 90%, 100%.
- `VOICEOVER_MAX_CHARACTERS`: 500.
- `IMAGE_MODES`: preview, standard, HQ.

Generation/provider code must not duplicate these values.

## Reservation lifecycle

Billable AI routes use:

`authorize -> reserve -> provider -> finalize`

On provider/infrastructure failure with no usable output:

`reserve -> refund`

A finalized successful generation is not refundable because the user dislikes the output.

Reservations are protected by database row locks and idempotency keys.

## Billing periods

Paid plans use a monthly entitlement window anchored to the subscription billing anchor. Free users use the calendar month because they have no paid subscription period.

Historical usage is retained. A plan upgrade increases the current period's entitlement without resetting consumed usage. A paid downgrade is recorded as pending and does not take effect early.

## Workspace accounting

Credits belong to the account/subscription, not individual Business workspaces. Usage events may include `workspace_id` for analytics.

## Authentication

AI and distribution endpoints require the signed `xcr8_usage_session` HttpOnly cookie issued after successful authentication. The client-supplied `user_id` and `X-Xcr8-User-Id` are only consistency claims; they are not the authentication authority.

`PULSE_SESSION_SECRET` must be configured with at least 32 random characters. The Render Blueprint provisions this secret.

## API boundaries

User usage is available through the plans usage endpoint. Admin usage analytics are exposed through `/api/v1/admin/usage` and require the existing admin access control.

## Migration

`migrations/20261001_usage_credit_guardrails.sql` is additive. It preserves existing usage rows and backfills legacy calendar-period boundaries. It adds billing-period, subscription, workspace, feature, provider/model and estimated external-cost fields.

The migration must be applied before deploying code that relies on the new columns.
