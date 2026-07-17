import { NextRequest, NextResponse } from "next/server";

const ADMIN_PREFIX = "admin.";

function isInternalPath(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/images")
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host")?.toLowerCase() ?? "";
  const isAdminHost = host.startsWith(ADMIN_PREFIX);
  const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");

  if (isAdminHost && !isInternalPath(pathname)) {
    if (!isAdminPath) {
      const url = request.nextUrl.clone();
      url.pathname = pathname === "/" ? "/admin" : `/admin${pathname}`;
      return NextResponse.rewrite(url);
    }
    return NextResponse.next();
  }

  if (!isAdminHost && isAdminPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/welcome";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"],
};
