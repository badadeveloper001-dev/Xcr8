import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";

export function resolveMainAppOrigin(request: NextRequest): string {
  const forwardedProto =
    request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const hostname = host.split(":")[0] ?? host;
  const port = host.includes(":") ? `:${host.split(":").slice(1).join(":")}` : "";

  if (hostname.startsWith("admin-")) {
    return `${forwardedProto}://${hostname.slice("admin-".length)}${port}`;
  }

  if (hostname.startsWith("admin.")) {
    return `${forwardedProto}://${hostname.slice("admin.".length)}${port}`;
  }

  return `${forwardedProto}://${host}`;
}

function sessionAdminCode(request: NextRequest): string | null {
  const configured = process.env.ADMIN_ACCESS_CODE || "";
  const sessionSecret = process.env.ADMIN_SESSION_SECRET || configured;
  const token = request.cookies.get("xcr8_admin_session")?.value || "";
  const [version, expiresAt, signature] = token.split(".");
  const payload = version + "." + expiresAt;
  if (!configured || !sessionSecret || version !== "v1" || !expiresAt || !signature || Number(expiresAt) < Math.floor(Date.now() / 1000)) return null;
  const expected = createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  const expectedBytes = Buffer.from(expected);
  const signatureBytes = Buffer.from(signature);
  return expectedBytes.length === signatureBytes.length && timingSafeEqual(expectedBytes, signatureBytes) ? configured : null;
}

export async function proxyAdminRequest(
  request: NextRequest,
  backendPath: string,
  init?: RequestInit,
): Promise<Response> {
  const targetOrigin = resolveMainAppOrigin(request);
  const targetUrl = `${targetOrigin}${backendPath}`;

  const headers = new Headers(init?.headers ?? request.headers);
  headers.delete("host");
  if (!headers.get("x-admin-code")) {
    const sessionCode = sessionAdminCode(request);
    if (sessionCode) headers.set("x-admin-code", sessionCode);
  }

  const response = await fetch(targetUrl, {
    method: init?.method ?? request.method,
    headers,
    body: init?.body,
    redirect: "follow",
    cache: "no-store",
  });

  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("transfer-encoding");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}
