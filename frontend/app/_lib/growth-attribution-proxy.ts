import { NextRequest } from "next/server";

const BACKEND_API_URL =
  process.env.BACKEND_API_URL ?? process.env.BACKEND_INTERNAL_URL ?? process.env.BACKEND_URL;

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
}

export async function proxyGrowthAttribution(request: NextRequest, backendPath: string): Promise<Response> {
  const baseUrl = BACKEND_API_URL ? normalizeBaseUrl(BACKEND_API_URL) : "";
  if (!baseUrl) return Response.json({ detail: "Backend API is not configured." }, { status: 503 });
  const target = new URL(`${baseUrl}/api/v1${backendPath}`);
  request.nextUrl.searchParams.forEach((value, key) => target.searchParams.set(key, value));
  const headers = new Headers(request.headers);
  for (const name of Array.from(headers.keys())) {
    if (["host","connection","content-length","transfer-encoding","accept-encoding","keep-alive","te","trailer","upgrade"].includes(name) || name.startsWith("sec-")) headers.delete(name);
  }
  headers.set("accept-encoding", "identity");
  const upstream = await fetch(target, { method: "GET", headers, redirect: "manual", cache: "no-store" });
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("content-length");
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("transfer-encoding");
  responseHeaders.delete("connection");
  responseHeaders.set("Cache-Control", "private, no-store");
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: responseHeaders });
}