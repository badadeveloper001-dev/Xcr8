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

export async function proxyAdminRequest(
  request: NextRequest,
  backendPath: string,
  init?: RequestInit,
): Promise<Response> {
  const targetOrigin = resolveMainAppOrigin(request);
  const targetUrl = `${targetOrigin}${backendPath}`;

  const headers = new Headers(init?.headers ?? request.headers);
  headers.delete("host");

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
