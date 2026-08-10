import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { gameStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  return NextResponse.json(await gameStore.snapshot(), {
    headers: { "cache-control": "no-store" },
  });
}
