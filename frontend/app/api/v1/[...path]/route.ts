import { NextRequest } from "next/server";

const BACKEND_API_URL =
  process.env.BACKEND_API_URL ?? process.env.BACKEND_INTERNAL_URL ?? process.env.BACKEND_URL;

function getTargetUrl(path: string[], searchParams: URLSearchParams): URL | null {
  if (!BACKEND_API_URL) {
    return null;
  }

  const base = BACKEND_API_URL.replace(/\/$/, "");
  const suffix = path.join("/");
  const url = new URL(`${base}/api/v1/${suffix}`);
  const search = searchParams.toString();

  if (search) {
    url.search = search;
  }

  return url;
}

async function proxy(request: NextRequest, path: string[]) {
  const targetUrl = getTargetUrl(path, request.nextUrl.searchParams);

  if (!targetUrl) {
    return Response.json(
      {
        detail:
          "Backend API is not configured. Set BACKEND_API_URL or use the injected BACKEND_URL service variable.",
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
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text();
  }

  const upstreamResponse = await fetch(targetUrl, init);
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
