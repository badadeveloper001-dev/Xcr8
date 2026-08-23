# Environment Variables

## Shared

- `NODE_ENV`: runtime mode
- `LOG_LEVEL`: logging verbosity

## Frontend

- `NEXT_PUBLIC_API_URL`: frontend API base URL. Keep this as `/` so browser calls go through Next.js proxy routes.
- `BACKEND_API_URL`: backend base URL used by Next.js server-side API proxy (for local dev use `http://127.0.0.1:8000`).
- `NEXT_PUBLIC_USE_DIRECT_API`: optional flag (`true`) to bypass proxy and call `NEXT_PUBLIC_API_URL` directly from browser.
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase public anon key

## Backend

- `API_HOST`: backend bind host
- `API_PORT`: backend bind port
- `DATABASE_URL`: SQLAlchemy connection URL (if omitted, backend can derive from Supabase DB vars)
- `SUPABASE_DB_PROJECT_REF`: Supabase project ref used to derive database host
- `SUPABASE_DB_PASSWORD`: Supabase Postgres password used for derived connection
- `SUPABASE_DB_HOST`: optional override for Supabase DB host or pooler endpoint
- `SUPABASE_DB_PORT`: optional override for DB port (default `5432`)
- `REDIS_URL`: cache and pub/sub Redis URL
- `CELERY_BROKER_URL`: Celery broker URL
- `CELERY_RESULT_BACKEND`: Celery result backend
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_ANON_KEY`: Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key
- `SUPABASE_JWT_SECRET`: Supabase JWT secret
- `SMTP_HOST`: SMTP server host used for sending signup verification codes
- `SMTP_PORT`: SMTP server port (commonly `587` for TLS)
- `SMTP_USERNAME`: SMTP auth username
- `SMTP_PASSWORD`: SMTP auth password or app password
- `SMTP_FROM_EMAIL`: sender email address used for verification messages
- `SMTP_FROM_NAME`: sender display name (default `XCR8`)
- `SMTP_USE_TLS`: use STARTTLS (`true`/`false`)
- `SMTP_USE_SSL`: use implicit SSL (`true`/`false`)
- `SIGNUP_CODE_TTL_MINUTES`: verification code expiry time in minutes (default `10`)
- `ADMIN_ACCESS_CODE`: admin dashboard access code (default `XCR800`)
- `FOUNDER_ALERT_EMAILS`: comma-separated founder emails for Pulse incident alerts
- `PULSE_SLACK_WEBHOOK_URL`: optional Slack webhook for founder alerts
- `PULSE_DISCORD_WEBHOOK_URL`: optional Discord webhook for founder alerts
- `PULSE_INTERNAL_TOKEN`: shared secret for internal Pulse event ingestion from workers/services
- `PULSE_SLOW_REQUEST_MS`: threshold for slow-response incident capture (default `6000`)
- `PULSE_USER_EMAIL_ENABLED`: optional switch for Pulse user emails (default `false`). In-app notifications remain the primary user channel.
- `CRON_SECRET`: random secret used by Vercel Cron to securely invoke the due-post dispatcher.
- `BILLING_WEBHOOK_SECRET`: HMAC secret required to activate paid plans through the verified billing webhook.
- `AI_INTERNAL_TOKEN`: shared high-entropy secret used by the backend to call costly AI microservice routes. Set the same value for backend and AI services.
- `THREADS_APP_ID` / `THREADS_APP_SECRET`: Threads OAuth credentials. The Meta app must allow the production callback URL at `https://your-domain/auth/platform-callback`.

## AI Services

- `AI_SERVICE_HOST`: AI service bind host
- `AI_SERVICE_PORT`: AI service bind port
- `OPENAI_API_KEY`: OpenAI key for caption and memory intelligence
- `OPENAI_MODEL`: everyday Cr8or AI model (recommended: `gpt-5.4-mini`)
- `OPENAI_HIGH_REASONING_MODEL`: automatic high-quality model for deep research and strategy (recommended: `gpt-5.4`)
- `AI_INTERNAL_TOKEN`: must match the backend value; direct public calls to AI generation endpoints are rejected.
- `PINECONE_API_KEY`: Pinecone API key
- `PINECONE_ENVIRONMENT`: Pinecone region/env

## Storage (AWS S3 and Cloudflare R2)

- `STORAGE_PROVIDER`: `s3` or provider tag
- `STORAGE_BUCKET`: object bucket name
- `STORAGE_REGION`: region
- `STORAGE_ACCESS_KEY_ID`: access key
- `STORAGE_SECRET_ACCESS_KEY`: secret key
- `STORAGE_ENDPOINT_URL`: optional endpoint for S3-compatible providers like Cloudflare R2
