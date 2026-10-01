import { NextRequest } from "next/server";
import { proxyGrowthAttribution } from "@/app/_lib/growth-attribution-proxy";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ referral_code: string }> },
) {
  const { referral_code } = await context.params;
  return proxyGrowthAttribution(request, `/r/${encodeURIComponent(referral_code)}`);
}
