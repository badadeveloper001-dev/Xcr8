# Deploy Xcr8 on Render

Xcr8 uses a Render Blueprint so the web app, API, internal AI service, and scheduled-post dispatcher are created consistently from one file.

## Architecture

- `xcr8-creator-os-web`: Next.js frontend. Browser API calls remain same-origin at `/api/v1/*`.
- `xcr8-creator-os-api`: FastAPI backend and the private AI process in one fixed-size Render web service. The AI process listens only on localhost and is not publicly exposed.
- `xcr8-scheduled-post-dispatch`: cron job that invokes the protected due-post dispatcher every minute.
- Existing Supabase/Postgres and S3-compatible storage remain the source of truth. This migration does not copy or reset application data.

Render injects the API service's private `hostport` into the frontend and cron services. Generated secret values are shared through the Blueprint environment group.

## Before deployment

1. Keep the Vercel production deployment running until all Render smoke checks pass.
2. Open the current Vercel environment-variable page and prepare to copy values directly into Render. Never paste secret values into GitHub, an issue, or chat.
3. Confirm the Render workspace can access `badadeveloper001-dev/Xcr8`.
4. Review the estimated monthly total shown by Render before applying the Blueprint. The Blueprint uses fixed Starter instances to avoid sleeping services; the cron job is billed separately.

## Create the Blueprint

Open:

https://dashboard.render.com/blueprint/new?repo=https://github.com/badadeveloper001-dev/Xcr8

Select branch `main` and apply the root `render.yaml`.

During initial creation, Render prompts for environment variables marked `sync: false`. Copy their production values from Vercel. The generated secrets do not need to be copied manually.

Required for the app to start:

- `DATABASE_URL`
- `FRONTEND_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `STORAGE_BUCKET`, `STORAGE_REGION`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, and `STORAGE_ENDPOINT_URL`

Required for the corresponding feature:

- AI: `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, `PINECONE_API_KEY`
- Meta/Facebook/Instagram: `META_APP_ID`, `META_APP_SECRET`
- Threads: `THREADS_APP_ID`, `THREADS_APP_SECRET`
- Google/YouTube: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- Signup email: `SMTP_HOST`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`
- Admin and billing: `ADMIN_ACCESS_CODE`, `BILLING_WEBHOOK_SECRET`
- Pulse external alerts: `FOUNDER_ALERT_EMAILS`, `PULSE_SLACK_WEBHOOK_URL`, `PULSE_DISCORD_WEBHOOK_URL`

Set `FRONTEND_URL` to the exact public Render web URL with no trailing slash, for example `https://xcr8-creator-os-web.onrender.com`. If Render assigns a different hostname, update the variable after creation and redeploy the API service.

Blank optional secrets disable only their associated integration. Do not invent replacement OAuth or provider credentials.

## Update OAuth allowlists

After the frontend has its final Render hostname, add the following exact redirect URI to the Meta app used by Facebook, Instagram, and Threads:

`https://<render-frontend-host>/auth/platform-callback`

Also add the Render hostname/redirect path to the Google OAuth client and update any Supabase Auth site URL or redirect allowlist used by Xcr8. Keep the existing production-domain entries until custom-domain cutover is complete.

## Smoke checks

Do not move production traffic until all of these pass:

1. Render shows both web services as live and the API health check is healthy.
2. `https://<render-frontend-host>/api/v1/health` returns `{"status":"ok"}`.
3. Login and signup work against existing accounts/data.
4. Admin login works.
5. Cr8or AI text generation works; then test the configured fallback provider.
6. Image generation and voiceover work on an entitled paid test account.
7. Upload an image and verify its public URL.
8. Connect one test social account after OAuth allowlists are updated.
9. Schedule a private/test post a few minutes ahead and verify the cron publishes it once.
10. Confirm the Render cron history shows successful runs and no repeated dispatch of the same schedule.

## Production cutover

1. Add the production custom domain to `xcr8-creator-os-web` in Render.
2. Follow Render's displayed DNS records and wait for TLS to become ready.
3. Set backend `FRONTEND_URL` to the final production URL and redeploy the API.
4. Recheck OAuth callback allowlists for the final domain.
5. Run the smoke checks again on the production domain.
6. Only then disconnect the Git repository/custom domain from Vercel and cancel or downgrade the Vercel project as appropriate.

Keep Vercel available briefly as a rollback target, but disconnect automatic deployments after cutover so pushes do not continue consuming Vercel build resources.

## Rollback

If a blocking problem appears before DNS cutover, keep serving Vercel while fixing Render. If it appears after cutover, restore the previous DNS target, then inspect Render service and cron logs. The database and storage remain shared, so rollback does not require restoring application data.
