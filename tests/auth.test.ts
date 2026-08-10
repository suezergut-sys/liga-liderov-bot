import { afterEach, describe, expect, it } from "vitest";
import { createAdminSession, verifyAdminPassword, verifyAdminSession } from "@/lib/auth";

const originalPassword = process.env.ADMIN_PASSWORD;
const originalSecret = process.env.SESSION_SECRET;

afterEach(() => {
  process.env.ADMIN_PASSWORD = originalPassword;
  process.env.SESSION_SECRET = originalSecret;
});

describe("admin auth", () => {
  it("accepts a valid signed session and rejects a tampered one", () => {
    process.env.SESSION_SECRET = "test-secret";
    const token = createAdminSession(1_000_000);
    expect(verifyAdminSession(token, 1_000_000)).toBe(true);
    expect(verifyAdminSession(`${token}x`, 1_000_000)).toBe(false);
  });

  it("checks the configured password", () => {
    process.env.ADMIN_PASSWORD = "correct horse battery staple";
    expect(verifyAdminPassword("correct horse battery staple")).toBe(true);
    expect(verifyAdminPassword("wrong")).toBe(false);
  });
});
