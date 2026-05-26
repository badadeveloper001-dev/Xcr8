# Environment Variables

## Shared

- `NODE_ENV`: runtime mode
- `LOG_LEVEL`: logging verbosity

## Frontend

- `NEXT_PUBLIC_API_URL`: backend API base URL
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

## AI Services

- `AI_SERVICE_HOST`: AI service bind host
- `AI_SERVICE_PORT`: AI service bind port
- `OPENAI_API_KEY`: OpenAI key for caption and memory intelligence
- `OPENAI_MODEL`: model id to use
- `PINECONE_API_KEY`: Pinecone API key
- `PINECONE_ENVIRONMENT`: Pinecone region/env

## Storage (AWS S3 and Cloudflare R2)

- `STORAGE_PROVIDER`: `s3` or provider tag
- `STORAGE_BUCKET`: object bucket name
- `STORAGE_REGION`: region
- `STORAGE_ACCESS_KEY_ID`: access key
- `STORAGE_SECRET_ACCESS_KEY`: secret key
- `STORAGE_ENDPOINT_URL`: optional endpoint for S3-compatible providers like Cloudflare R2
