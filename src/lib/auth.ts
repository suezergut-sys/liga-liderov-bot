import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "ll_admin_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60;

function secret() {
  return process.env.SESSION_SECRET ?? "local-demo-session-secret-not-for-production";
}

function signature(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createAdminSession(now = Date.now()) {
  const expires = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  const payload = `admin.${expires}`;
  return `${payload}.${signature(payload)}`;
}

export function verifyAdminSession(token: string | undefined, now = Date.now()) {
  if (!token) return false;
  const [role, expiresRaw, providedSignature] = token.split(".");
  if (role !== "admin" || !expiresRaw || !providedSignature) return false;
  const payload = `${role}.${expiresRaw}`;
  if (!safeEqual(signature(payload), providedSignature)) return false;
  return Number(expiresRaw) > Math.floor(now / 1000);
}

export function verifyAdminPassword(password: string) {
  const configured = process.env.ADMIN_PASSWORD;
  if (!configured) return process.env.NODE_ENV !== "production";
  return safeEqual(password, configured);
}

export function isAdminRequest(request: NextRequest) {
  if (!process.env.ADMIN_PASSWORD && process.env.NODE_ENV !== "production") return true;
  return verifyAdminSession(request.cookies.get(COOKIE_NAME)?.value);
}

export const adminCookie = {
  name: COOKIE_NAME,
  options: {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  },
};
