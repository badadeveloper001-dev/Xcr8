import { NextRequest } from "next/server";
import { GET as proxyBackendGet } from "@/app/api/v1/[...path]/route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const providerHosts: Record<string, string[]> = {
  instagram: ["www.facebook.com", "facebook.com", "www.instagram.com", "instagram.com"],
  facebook: ["www.facebook.com", "facebook.com"],
  youtube_shorts: ["accounts.google.com"],
  threads: ["threads.net", "www.threads.net", "threads.com", "www.threads.com"],
};

function returnToSettings(request: NextRequest, message: string) {
  const target = new URL("/settings", request.url);
  target.searchParams.set("oauth_error", message);
  target.hash = "connected-platforms";
  return new Response(null, {
    status: 303,
    headers: {
      Location: target.toString(),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

/** Native same-tab navigation: the browser follows the provider redirect itself.
 * Reuse the existing proxy without an extra HTTP hop. The backend still creates
 * and verifies signed OAuth state and checks the selected workspace entitlement.
 */
export async function GET(request: NextRequest) {
  const platform = request.nextUrl.searchParams.get("platform") || "";
  const userId = request.nextUrl.searchParams.get("user_id") || "";
  const workspaceId = request.nextUrl.searchParams.get("workspace_id") || "main";
  const allowedHosts = Object.prototype.hasOwnProperty.call(providerHosts, platform)
    ? providerHosts[platform]
    : undefined;
  if (!allowedHosts || !/^[1-9]\d*$/.test(userId) ||
      !Number.isSafeInteger(Number(userId)) ||
      (workspaceId !== "main" && (!/^[1-9]\d*$/.test(workspaceId) ||
        !Number.isSafeInteger(Number(workspaceId))))) {
    return returnToSettings(request, "Invalid connection request. Please choose a platform again.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const target = new URL("/api/v1/social/oauth/" + platform + "/start", request.url);
    target.searchParams.set("user_id", userId);
    const headers = new Headers(request.headers);
    headers.set("Accept", "application/json");
    headers.set("X-Xcr8-User-Id", userId);
    headers.set("X-Xcr8-Workspace-Id", workspaceId);
    const upstream = await proxyBackendGet(
      new NextRequest(target, { headers, signal: controller.signal }),
      { params: Promise.resolve({ path: ["social", "oauth", platform, "start"] }) },
    );
    if (!upstream.ok) {
      const reference = upstream.headers.get("X-Xcr8-Request-Id");
      await upstream.body?.cancel();
      const message = upstream.status === 501
        ? "This platform is not configured for OAuth yet. Please contact support."
        : upstream.status === 403
          ? "This creator profile cannot connect right now. Check your active profile and plan."
          : `Connection service returned HTTP ${upstream.status}. Please retry.${reference ? " Reference: " + reference : ""}`;
      return returnToSettings(request, message);
    }
    const data: unknown = await upstream.json();
    if (!data || typeof data !== "object" || !("auth_url" in data) ||
        typeof data.auth_url !== "string") {
      throw new Error("Invalid OAuth response");
    }
    const authorizationUrl = new URL(data.auth_url);
    if (authorizationUrl.protocol !== "https:" || authorizationUrl.username ||
        authorizationUrl.password || authorizationUrl.port ||
        !allowedHosts.includes(authorizationUrl.hostname)) {
      throw new Error("Unexpected OAuth destination");
    }
    return new Response(null, {
      status: 303,
      headers: {
        Location: authorizationUrl.toString(),
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    return returnToSettings(
      request,
      "The connection service did not respond. Please try again. If you opened Xcr8 inside another app, open it in Chrome or your regular browser.",
    );
  } finally {
    clearTimeout(timeout);
  }
}
