export const dynamic = "force-dynamic";

type PricePair = {
  monthly: number;
  annual: number;
};

const GLOBAL_PRICES: Record<string, PricePair> = {
  free: { monthly: 0, annual: 0 },
  starter: { monthly: 900, annual: 9000 },
  pro: { monthly: 2900, annual: 29000 },
  business: { monthly: 9900, annual: 99000 },
};

const NIGERIA_PRICES: Record<string, PricePair> = {
  free: { monthly: 0, annual: 0 },
  starter: { monthly: 750000, annual: 7500000 },
  pro: { monthly: 2000000, annual: 20000000 },
  business: { monthly: 5000000, annual: 50000000 },
};

function formatPrice(amountMinor: number, currency: "USD" | "NGN"): string {
  return new Intl.NumberFormat(currency === "NGN" ? "en-NG" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

export function GET(request: Request) {
  const countryCode = (
    request.headers.get("cf-ipcountry") ||
    request.headers.get("x-country-code") ||
    request.headers.get("x-vercel-ip-country") ||
    ""
  )
    .trim()
    .toUpperCase();
  const isNigeria = countryCode === "NG";
  const currency = isNigeria ? "NGN" : "USD";
  const region = isNigeria ? "nigeria" : "global";
  const source = isNigeria ? NIGERIA_PRICES : GLOBAL_PRICES;

  const plans = Object.fromEntries(
    Object.entries(source).map(([planId, price]) => [
      planId,
      {
        region,
        country_code: countryCode || null,
        currency,
        monthly_amount_minor: price.monthly,
        annual_amount_minor: price.annual,
        monthly_formatted: formatPrice(price.monthly, currency),
        annual_formatted: formatPrice(price.annual, currency),
        annual_savings_months: 2,
      },
    ]),
  );

  return Response.json(
    { region, country_code: countryCode || null, currency, plans },
    {
      headers: {
        "Cache-Control": "private, no-store",
        Vary: "CF-IPCountry, X-Country-Code, X-Vercel-IP-Country",
      },
    },
  );
}
