import { get } from "@vercel/blob";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { getFileUploadDetails, isPrivateVercelBlobUrl } from "@/lib/file-submission";
import { gameStore } from "@/lib/store";

export const dynamic = "force-dynamic";

function downloadContentDisposition(fileName: string) {
  const asciiName = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || "submission.xlsx";
  const encodedName = encodeURIComponent(fileName).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`;
}

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });

  const eventId = request.nextUrl.searchParams.get("event");
  if (!eventId) return NextResponse.json({ error: "Не указано событие загрузки" }, { status: 400 });

  const snapshot = await gameStore.snapshot();
  const event = snapshot.audit.find((item) => item.id === eventId);
  const details = event ? getFileUploadDetails(event) : undefined;
  if (!details || !isPrivateVercelBlobUrl(details.fileUrl)) {
    return NextResponse.json({ error: "Файл недоступен для скачивания" }, { status: 404 });
  }

  try {
    const result = await get(details.fileUrl, { access: "private" });
    if (!result || result.statusCode !== 200) {
      return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
    }

    return new Response(result.stream, {
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": downloadContentDisposition(details.fileName),
        "content-length": String(result.blob.size),
        "content-type": result.blob.contentType || "application/octet-stream",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Private Vercel Blob download failed", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Не удалось скачать файл" }, { status: 502 });
  }
}
