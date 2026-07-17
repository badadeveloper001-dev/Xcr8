import { NextRequest } from "next/server";

import { proxyAdminRequest } from "../../_lib";

export async function POST(request: NextRequest) {
  const body = await request.text();
  return proxyAdminRequest(request, "/api/v1/admin/incidents/test", {
    method: "POST",
    body,
  });
}
