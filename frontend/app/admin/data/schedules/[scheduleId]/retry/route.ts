import { NextRequest } from "next/server";

import { proxyAdminRequest } from "../../../_lib";

export async function POST(request: NextRequest, { params }: { params: { scheduleId: string } }) {
  return proxyAdminRequest(request, `/api/v1/admin/schedules/${params.scheduleId}/retry`);
}
