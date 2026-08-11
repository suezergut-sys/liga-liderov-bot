import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getBlob } = vi.hoisted(() => ({ getBlob: vi.fn() }));

vi.mock("@vercel/blob", () => ({ get: getBlob }));

import { GET as downloadFile } from "@/app/api/admin/files/route";
import { getBotConfig } from "@/lib/config";
import { isDownloadableFileUrl } from "@/lib/file-submission";
import { gameStore } from "@/lib/store";

const originalAdminPassword = process.env.ADMIN_PASSWORD;
const teamBot = getBotConfig("team-1")!;
const originalBotToken = teamBot.token;

describe("admin file download", () => {
  beforeEach(async () => {
    delete process.env.ADMIN_PASSWORD;
    teamBot.token = "test-token";
    getBlob.mockReset();
    await gameStore.reset();
    await gameStore.startGame();
    await gameStore.selectChoice("team-1", "urgent-hire");
    await gameStore.confirmChoice("team-1");
  });

  afterEach(() => {
    process.env.ADMIN_PASSWORD = originalAdminPassword;
    teamBot.token = originalBotToken;
    vi.unstubAllGlobals();
  });

  it("streams a private Vercel Blob referenced by an audited upload", async () => {
    await gameStore.attachFile(
      "team-1",
      "budget-team-1.xlsx",
      "https://store.private.blob.vercel-storage.com/submissions/budget-team-1.xlsx",
    );
    const event = (await gameStore.snapshot()).audit[0];
    getBlob.mockResolvedValue({
      statusCode: 200,
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("workbook"));
          controller.close();
        },
      }),
      blob: { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: 8 },
    });

    const response = await downloadFile(new NextRequest(`http://localhost/api/admin/files?event=${event.id}`));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("workbook");
    expect(response.headers.get("content-disposition")).toContain("budget-team-1.xlsx");
    expect(getBlob).toHaveBeenCalledWith(
      "https://store.private.blob.vercel-storage.com/submissions/budget-team-1.xlsx",
      { access: "private" },
    );
  });

  it("streams an audited Telegram file when Vercel Blob is unavailable", async () => {
    await gameStore.attachFile("team-1", "budget-team-1.xlsx", "telegram-file:telegram-file-id");
    const event = (await gameStore.snapshot()).audit[0];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        result: { file_path: "documents/budget-team-1.xlsx" },
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response("telegram-workbook", {
        status: 200,
        headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await downloadFile(new NextRequest(`http://localhost/api/admin/files?event=${event.id}`));

    expect(isDownloadableFileUrl("telegram-file:telegram-file-id")).toBe(true);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("telegram-workbook");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://api.telegram.org/file/bottest-token/documents/budget-team-1.xlsx");
    expect(getBlob).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests and unsupported file references", async () => {
    await gameStore.attachFile("team-1", "budget-team-1.xlsx", "unsupported-file:file-id");
    const event = (await gameStore.snapshot()).audit[0];

    const unavailable = await downloadFile(new NextRequest(`http://localhost/api/admin/files?event=${event.id}`));
    expect(unavailable.status).toBe(404);

    process.env.ADMIN_PASSWORD = "configured";
    const unauthorized = await downloadFile(new NextRequest(`http://localhost/api/admin/files?event=${event.id}`));
    expect(unauthorized.status).toBe(401);
    expect(getBlob).not.toHaveBeenCalled();
  });
});
