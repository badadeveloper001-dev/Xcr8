import { NextRequest } from "next/server";

import { proxyAdminRequest } from "../../../_lib";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  const { userId } = await context.params;
  if (!/^\d+$/.test(userId)) {
    return Response.json({ detail: "Invalid creator ID." }, { status: 400 });
  }
  const body = await request.text();
  return proxyAdminRequest(request, `/api/v1/admin/creators/${userId}/plan`, {
    method: "PATCH",
    body,
  });
}
