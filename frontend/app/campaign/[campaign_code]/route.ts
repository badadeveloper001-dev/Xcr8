import { NextRequest } from "next/server";
import { proxyGrowthAttribution } from "@/app/_lib/growth-attribution-proxy";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ campaign_code: string }> },
) {
  const { campaign_code } = await context.params;
  return proxyGrowthAttribution(request, `/campaign/${encodeURIComponent(campaign_code)}`);
}
