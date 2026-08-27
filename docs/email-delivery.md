# XCR8 email delivery

XCR8 uses one provider-agnostic SMTP mailer for transactional email. The app never
fails a signup, payment activation, or Pulse incident just because an email relay
is unavailable; delivery outcomes are recorded by the caller and in-app Pulse
notifications remain the fallback.

## Configure on Render

Set these variables on the backend service:

- `SMTP_HOST`: relay hostname
- `SMTP_PORT`: usually `587` for STARTTLS or `465` for implicit SSL
- `SMTP_USERNAME` / `SMTP_PASSWORD`: relay credentials or app password
- `SMTP_FROM_EMAIL`: a verified sender address
- `SMTP_FROM_NAME`: optional display name (defaults to `XCR8`)
- `SMTP_USE_TLS`: `true` for STARTTLS (recommended on port 587)
- `SMTP_USE_SSL`: `true` for implicit SSL (use instead of TLS on port 465)
- `PULSE_USER_EMAIL_ENABLED`: set `true` only after testing user incident email

The username and password can be blank for a trusted internal relay, but a hosted
relay normally requires an app password. Never put SMTP credentials in frontend
variables or source control.

## Messages

- Signup verification codes use the existing Supabase/auth flow and local SMTP fallback.
- Verified Paystack activations send a plan receipt after the database commit.
- Pulse sends founder alerts when `FOUNDER_ALERT_EMAILS` is set.
- Pulse always creates an in-app notification for an affected user. Optional issue
  and resolved emails are enabled with `PULSE_USER_EMAIL_ENABLED=true`.

Use a dedicated transactional sender/domain and monitor bounce and complaint rates
before enabling user email at scale. SMTP provider limits and pricing are
provider-specific and must be checked in the provider console.
