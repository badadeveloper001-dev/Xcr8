import { NextRequest } from "next/server";

import { proxyAdminRequest } from "../_lib";

export async function GET(request: NextRequest) {
  return proxyAdminRequest(request, "/api/v1/admin/creators");
}
