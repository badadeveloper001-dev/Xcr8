# Environment Variables

## Shared

- `NODE_ENV`: runtime mode
- `LOG_LEVEL`: logging verbosity

## Frontend

- `NEXT_PUBLIC_API_URL`: frontend API base URL. Keep this as `/` so browser calls go through the Next.js proxy.
- `BACKEND_API_URL`: backend base URL used by the server-side Next.js API proxy. Render supplies the API service's private `hostport`; local development can use `http://127.0.0.1:8000`.
- `NEXT_PUBLIC_USE_DIRECT_API`: optional flag (`true`) to bypass the proxy and call `NEXT_PUBLIC_API_URL` directly from the browser.
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase public anon key.

## Backend

- `API_HOST`: backend bind host.
- `API_PORT`: backend bind port.
- `DATABASE_URL`: SQLAlchemy connection URL (if omitted, the backend can derive it from Supabase DB variables).
- `SUPABASE_DB_PROJECT_REF`: Supabase project ref used to derive the database host.
- `SUPABASE_DB_PASSWORD`: Supabase Postgres password used for a derived connection.
- `SUPABASE_DB_HOST`: optional override for the Supabase DB host or pooler endpoint.
- `SUPABASE_DB_PORT`: optional override for DB port (default `5432`).
- `REDIS_URL`: cache and pub/sub Redis URL.
- `CELERY_BROKER_URL`: Celery broker URL.
- `CELERY_RESULT_BACKEND`: Celery result backend.
- `SUPABASE_URL`: Supabase project URL.
- `SUPABASE_ANON_KEY`: Supabase anon key.
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service-role key.
- `SUPABASE_JWT_SECRET`: Supabase JWT secret.
- `FRONTEND_URL`: exact public frontend origin, with no trailing slash. Render uses this to construct OAuth callback URLs.
- `SMTP_HOST`: SMTP server host used for sending signup verification codes.
- `SMTP_PORT`: SMTP server port (commonly `587` for TLS).
- `SMTP_USERNAME`: SMTP auth username.
- `SMTP_PASSWORD`: SMTP password or app password.
- `SMTP_FROM_EMAIL`: sender email address used for verification messages.
- `SMTP_FROM_NAME`: sender display name (default `XCR8`).
- `SMTP_USE_TLS`: use STARTTLS (`true`/`false`).
- `SMTP_USE_SSL`: use implicit SSL (`true`/`false`).
- `SIGNUP_CODE_TTL_MINUTES`: verification-code expiry in minutes (default `10`).
- `ADMIN_ACCESS_CODE`: admin dashboard access code.
- `FOUNDER_ALERT_EMAILS`: comma-separated founder emails for Pulse incident alerts.
- `PULSE_SLACK_WEBHOOK_URL`: optional Slack webhook for founder alerts.
- `PULSE_DISCORD_WEBHOOK_URL`: optional Discord webhook for founder alerts.
- `PULSE_INTERNAL_TOKEN`: shared secret for internal Pulse event ingestion.
- `PULSE_SLOW_REQUEST_MS`: threshold for slow-response incident capture (default `6000`).
- `PULSE_USER_EMAIL_ENABLED`: optional Pulse user-email switch (default `false`); in-app notifications remain primary.
- `CRON_SECRET`: random shared secret used by the scheduler cron to invoke the due-post dispatcher.
- `OAUTH_STATE_SECRET`: random signing secret for OAuth state.
- `BILLING_WEBHOOK_SECRET`: HMAC secret required to activate paid plans through the verified billing webhook.
- `AI_INTERNAL_TOKEN`: shared high-entropy secret used by the backend to call costly internal AI routes.
- `META_GRAPH_API_VERSION`: supported Meta Graph API version used for Facebook and Instagram (default `v22.0`).
- `META_APP_ID` / `META_APP_SECRET`: Meta OAuth credentials.
- `THREADS_APP_ID` / `THREADS_APP_SECRET`: Threads OAuth credentials. The Meta app must allow `https://your-domain/auth/platform-callback`.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: Google/YouTube OAuth credentials.

## AI Services

- `AI_SERVICE_HOST`: AI service bind host.
- `AI_SERVICE_PORT`: AI service bind port.
- `AI_SERVICE_URL`: internal AI-service base URL. The combined Render service uses `http://127.0.0.1:8100`.
- `OPENAI_API_KEY`: OpenAI key for caption and memory intelligence.
- `DEEPSEEK_API_KEY`: DeepSeek fallback key for supported text generation and caption adaptation.
- `OPENAI_MODEL`: everyday Cr8or AI model.
- `OPENAI_HIGH_REASONING_MODEL`: automatic high-quality model for deep research and strategy.
- `AI_INTERNAL_TOKEN`: must match the backend value; direct public AI-generation calls are rejected.
- `PINECONE_API_KEY`: Pinecone API key.
- `PINECONE_ENVIRONMENT`: Pinecone region/environment.
- `TIKTOKEN_CACHE_DIR`: writable token-cache directory (Render uses `/tmp/tiktoken`).

## Storage (AWS S3 and Cloudflare R2)

- `STORAGE_PROVIDER`: `s3` or provider tag.
- `STORAGE_BUCKET`: object bucket name.
- `STORAGE_REGION`: storage region.
- `STORAGE_ACCESS_KEY_ID`: access key.
- `STORAGE_SECRET_ACCESS_KEY`: secret key.
- `STORAGE_ENDPOINT_URL`: optional endpoint for S3-compatible providers such as Cloudflare R2.

## Render deployment

The root `render.yaml` creates persistent values for `AI_INTERNAL_TOKEN`, `CRON_SECRET`, `OAUTH_STATE_SECRET`, and `PULSE_INTERNAL_TOKEN`. Do not generate different copies for the services. Variables marked `sync: false` are entered once during initial Blueprint creation. See `docs/render-migration.md` for the deployment and cutover checklist.
