import { NextResponse } from "next/server";
import { checkDatabaseConnection, isDatabaseConfigured } from "@/lib/database";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, configured: false }, { status: 503 });
  }

  try {
    await checkDatabaseConnection();
    return NextResponse.json({ ok: true, configured: true });
  } catch {
    return NextResponse.json({ ok: false, configured: true }, { status: 503 });
  }
}
