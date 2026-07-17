import { NextRequest } from "next/server";

import { proxyAdminRequest } from "../../_lib";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ incidentId: string }> },
) {
  const { incidentId } = await context.params;
  const body = await request.text();
  return proxyAdminRequest(request, `/api/v1/admin/incidents/${incidentId}`, {
    method: "PATCH",
    body,
  });
}
