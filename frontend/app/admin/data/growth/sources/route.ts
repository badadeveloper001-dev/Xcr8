import { NextRequest } from "next/server";
import { proxyAdminRequest } from "../../_lib";

export async function GET(request: NextRequest) {
  const days = request.nextUrl.searchParams.get("days") || "30";
  return proxyAdminRequest(request, `/api/v1/admin/growth/sources?days=${encodeURIComponent(days)}`);
}
