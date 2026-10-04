import { NextRequest } from "next/server";
import { proxyAdminRequest } from "../../../_lib";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const sourceType = request.nextUrl.searchParams.get("source_type") || "";
  const sourceId = request.nextUrl.searchParams.get("source_id") || "";
  const status = request.nextUrl.searchParams.get("status") || "";
  return proxyAdminRequest(
    request,
    `/api/v1/admin/growth/referrals/${encodeURIComponent(sourceType)}/${encodeURIComponent(sourceId)}/status?status=${encodeURIComponent(status)}`,
    { method: "POST", body },
  );
}
