import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "xcr8_admin_session";
const MAX_AGE_SECONDS = 60 * 60;

function secret(): string {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_ACCESS_CODE || "";
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export async function POST(request: NextRequest) {
  const configuredCode = process.env.ADMIN_ACCESS_CODE || "";
  const body = await request.json().catch(() => null);
  const accessCode = typeof body?.accessCode === "string" ? body.accessCode.trim() : "";

  if (!configuredCode || !secret()) {
    return NextResponse.json({ detail: "Admin session is not configured." }, { status: 503 });
  }

  const expected = Buffer.from(configuredCode);
  const received = Buffer.from(accessCode);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return NextResponse.json({ detail: "Invalid admin access code." }, { status: 401 });
  }

  const expiresAt = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  const payload = "v1." + expiresAt;
  const token = payload + "." + sign(payload);
  const response = NextResponse.json({ authorized: true, expires_in_seconds: MAX_AGE_SECONDS });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE_SECONDS,
    path: "/admin",
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ authorized: false });
  response.cookies.set(COOKIE_NAME, "", { httpOnly: true, maxAge: 0, path: "/admin" });
  return response;
}
