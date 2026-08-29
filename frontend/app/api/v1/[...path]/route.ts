import { NextRequest } from "next/server";

// Keep compatibility with platforms that support per-route duration hints.
export const maxDuration = 60;

const BACKEND_API_URL =
  process.env.BACKEND_API_URL ?? process.env.BACKEND_INTERNAL_URL ?? process.env.BACKEND_URL;

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

function buildTargetUrl(baseUrl: string, path: string[], searchParams: URLSearchParams): URL {
  const base = normalizeBaseUrl(baseUrl);
  const suffix = path.join("/");
  const url = new URL(`${base}/api/v1/${suffix}`);
  const search = searchParams.toString();

  if (search) {
    url.search = search;
  }

  return url;
}

function getTargetCandidates(request: NextRequest, path: string[]): URL[] {
  const candidates: URL[] = [];

  if (BACKEND_API_URL) {
    candidates.push(buildTargetUrl(BACKEND_API_URL, path, request.nextUrl.searchParams));
  }

  // Keep the old Vercel service mount only during the migration window.
  if (process.env.VERCEL) {
    const sameOriginBackendBase = `${request.nextUrl.origin}/_/backend`;
    const sameOriginCandidate = buildTargetUrl(
      sameOriginBackendBase,
      path,
      request.nextUrl.searchParams,
    );

    if (!candidates.some((url) => url.toString() === sameOriginCandidate.toString())) {
      candidates.push(sameOriginCandidate);
    }
  }

  return candidates;
}

async function proxy(request: NextRequest, path: string[]) {
  const targetCandidates = getTargetCandidates(request, path);

  if (targetCandidates.length === 0) {
    return Response.json(
      {
        detail:
          "Backend API is not configured. Set BACKEND_API_URL to the Render backend service address.",
      },
      { status: 503 },
    );
  }

  const upstreamHeaders = new Headers(request.headers);
  // Browser transport and frontend routing metadata must not describe a new
  // server-to-server request. Some Android browsers advertise encodings that
  // the server fetch runtime cannot decode.
  for (const name of Array.from(upstreamHeaders.keys())) {
    if (["host", "connection", "content-length", "transfer-encoding", "accept-encoding",
      "keep-alive", "te", "trailer", "upgrade", "x-deployment-id", "rsc",
      "next-router-state-tree", "next-router-prefetch", "next-url"].includes(name)
      || name.startsWith("sec-")) upstreamHeaders.delete(name);
  }
  const cookies = (upstreamHeaders.get("cookie") || "").split(";")
    .filter((part) => part.trim() && part.trim().split("=")[0] !== "__vdpl").join(";");
  if (cookies) upstreamHeaders.set("cookie", cookies);
  else upstreamHeaders.delete("cookie");
  upstreamHeaders.set("accept-encoding", "identity");
  const requestId = globalThis.crypto?.randomUUID?.() ?? `xcr8-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  upstreamHeaders.set("x-xcr8-request-id", requestId);
  const retrySafe = request.method === "GET" || request.method === "HEAD";

  const init: RequestInit = {
    method: request.method,
    headers: upstreamHeaders,
    redirect: "manual",
    cache: "no-store",
    signal: request.signal,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    const rawBody = await request.arrayBuffer();
    if (rawBody.byteLength > 0) {
      init.body = rawBody;
    }
  }

  let upstreamResponse: Response | null = null;
  let upstreamHost = "";
  let sawNetworkFailure = false;

  for (const targetUrl of targetCandidates) {
    try {
      const response = await fetch(targetUrl, init);
      upstreamHost = targetUrl.hostname;

      // Retry with the next candidate when the upstream gateway blocks this route.
      // Vercel deployment protection can answer 402 before the backend.
      // Idempotency-Key makes retrying AI/publish/billing requests safe.
      const canRetryGateway = retrySafe || request.headers.has("idempotency-key");
      if (response.status === 402 && canRetryGateway) {
        await response.body?.cancel();
        upstreamResponse = response;
        continue;
      }

      upstreamResponse = response;
      break;
    } catch {
      sawNetworkFailure = true;
      // A failed transport does not prove the server did not charge/publish.
      if (!retrySafe || request.signal.aborted) break;
    }
  }

  if (!upstreamResponse) {
    return Response.json(
      {
        detail:
          "Unable to reach backend API from proxy. Verify BACKEND_API_URL and ensure backend is running.",
      },
      { status: 502 },
    );
  }

  if (upstreamResponse.status === 402 && sawNetworkFailure) {
    return Response.json(
      {
        detail:
          "Backend API routing failed. Verify the Render BACKEND_API_URL service reference.",
      },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("transfer-encoding");
  // fetch may decompress the body; the original length must not be forwarded.
  responseHeaders.delete("content-length");
  responseHeaders.delete("connection");
  responseHeaders.set("Cache-Control", "private, no-store");
  responseHeaders.set("X-Xcr8-Request-Id", requestId);
  if (!upstreamResponse.ok) {
    console.warn("xcr8_backend_response", { requestId, status: upstreamResponse.status,
      route: path.slice(0, 3).join("/"), upstreamHost,
      gatewayCode: upstreamResponse.headers.get("x-vercel-error") });
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function OPTIONS(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxy(request, path);
}
