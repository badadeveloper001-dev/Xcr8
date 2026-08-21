import { NextRequest } from "next/server";

import { proxyAdminRequest } from "../../../_lib";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ scheduleId: string }> },
) {
  const { scheduleId } = await params;
  return proxyAdminRequest(request, `/api/v1/admin/schedules/${scheduleId}/retry`);
}
