import { NextRequest, NextResponse } from "next/server";

import { proxyAdminRequest } from "../_lib";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

function backendPath(path: string[]): string | null {
  const joined = path.join("/");

  if (["creators", "content", "health", "ai-quality"].includes(joined)) {
    return `/api/v1/admin/${joined}`;
  }

  if (joined === "incidents/test") {
    return "/api/v1/admin/incidents/test";
  }

  if (/^incidents\/\d+(?:\/(?:notes|acknowledge))?$/.test(joined)) {
    return `/api/v1/admin/${joined}`;
  }

  if (/^schedules\/\d+\/retry$/.test(joined)) {
    return `/api/v1/admin/${joined}`;
  }

  return null;
}

async function forward(request: NextRequest, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  const targetPath = backendPath(path);

  if (!targetPath) {
    return NextResponse.json({ detail: "Unsupported admin operation." }, { status: 404 });
  }

  return proxyAdminRequest(request, `${targetPath}${request.nextUrl.search}`);
}

export async function GET(request: NextRequest, context: RouteContext) {
  return forward(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return forward(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return forward(request, context);
}
