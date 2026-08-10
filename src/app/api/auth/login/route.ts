import { NextResponse } from "next/server";
import { z } from "zod";
import { adminCookie, createAdminSession, verifyAdminPassword } from "@/lib/auth";

const schema = z.object({ password: z.string().max(200) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !verifyAdminPassword(parsed.data.password)) {
    return NextResponse.json({ error: "Неверный пароль" }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(adminCookie.name, createAdminSession(), adminCookie.options);
  return response;
}
