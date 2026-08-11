import { get } from "@vercel/blob";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { getBotConfig } from "@/lib/config";
import { getFileUploadDetails, getTelegramFileId, isPrivateVercelBlobUrl } from "@/lib/file-submission";
import { gameStore } from "@/lib/store";
import { downloadTelegramDocument } from "@/lib/telegram";

export const dynamic = "force-dynamic";

function downloadContentDisposition(fileName: string) {
  const asciiName = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_") || "submission.xlsx";
  const encodedName = encodeURIComponent(fileName).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`;
}

function downloadHeaders(fileName: string, contentType: string, contentLength?: number | string) {
  const headers = new Headers({
    "cache-control": "private, no-store",
    "content-disposition": downloadContentDisposition(fileName),
    "content-type": contentType || "application/octet-stream",
    "x-content-type-options": "nosniff",
  });
  if (contentLength !== undefined) headers.set("content-length", String(contentLength));
  return headers;
}

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });

  const eventId = request.nextUrl.searchParams.get("event");
  if (!eventId) return NextResponse.json({ error: "Не указано событие загрузки" }, { status: 400 });

  const snapshot = await gameStore.snapshot();
  const event = snapshot.audit.find((item) => item.id === eventId);
  const details = event ? getFileUploadDetails(event) : undefined;
  if (!details) {
    return NextResponse.json({ error: "Файл недоступен для скачивания" }, { status: 404 });
  }

  try {
    if (isPrivateVercelBlobUrl(details.fileUrl)) {
      const result = await get(details.fileUrl, { access: "private" });
      if (!result || result.statusCode !== 200) {
        return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
      }

      return new Response(result.stream, {
        headers: downloadHeaders(details.fileName, result.blob.contentType, result.blob.size),
      });
    }

    const telegramFileId = getTelegramFileId(details.fileUrl);
    const team = snapshot.teams.find((item) => item.id === event?.teamId);
    const bot = team ? getBotConfig(team.botKey) : undefined;
    if (!telegramFileId || !bot) {
      return NextResponse.json({ error: "Файл недоступен для скачивания" }, { status: 404 });
    }

    const response = await downloadTelegramDocument(bot, telegramFileId);
    if (!response.body) throw new Error("Telegram вернул пустой файл");
    return new Response(response.body, {
      headers: downloadHeaders(
        details.fileName,
        response.headers.get("content-type") ?? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        response.headers.get("content-length") ?? undefined,
      ),
    });
  } catch (error) {
    console.error("Admin file download failed", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Не удалось скачать файл" }, { status: 502 });
  }
}
