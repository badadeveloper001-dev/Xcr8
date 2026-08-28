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
  upstreamHeaders.delete("host");

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
  let sawNetworkFailure = false;

  for (const targetUrl of targetCandidates) {
    try {
      const response = await fetch(targetUrl, init);

      // Retry with the next candidate when the upstream gateway blocks this route.
      if (response.status === 402) {
        upstreamResponse = response;
        continue;
      }

      upstreamResponse = response;
      break;
    } catch {
      sawNetworkFailure = true;
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
