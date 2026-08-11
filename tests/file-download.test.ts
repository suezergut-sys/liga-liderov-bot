import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getBlob } = vi.hoisted(() => ({ getBlob: vi.fn() }));

vi.mock("@vercel/blob", () => ({ get: getBlob }));

import { GET as downloadFile } from "@/app/api/admin/files/route";
import { gameStore } from "@/lib/store";

const originalAdminPassword = process.env.ADMIN_PASSWORD;

describe("admin file download", () => {
  beforeEach(async () => {
    delete process.env.ADMIN_PASSWORD;
    getBlob.mockReset();
    await gameStore.reset();
    await gameStore.startGame();
    await gameStore.selectChoice("team-1", "urgent-hire");
    await gameStore.confirmChoice("team-1");
  });

  afterEach(() => {
    process.env.ADMIN_PASSWORD = originalAdminPassword;
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

  it("rejects unauthenticated requests and non-Blob placeholders", async () => {
    await gameStore.attachFile("team-1", "budget-team-1.xlsx", "telegram-file:file-id");
    const event = (await gameStore.snapshot()).audit[0];

    const unavailable = await downloadFile(new NextRequest(`http://localhost/api/admin/files?event=${event.id}`));
    expect(unavailable.status).toBe(404);

    process.env.ADMIN_PASSWORD = "configured";
    const unauthorized = await downloadFile(new NextRequest(`http://localhost/api/admin/files?event=${event.id}`));
    expect(unauthorized.status).toBe(401);
    expect(getBlob).not.toHaveBeenCalled();
  });
});
