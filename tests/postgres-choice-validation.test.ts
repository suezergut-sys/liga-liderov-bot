import type { TransactionSql } from "postgres";
import { describe, expect, it } from "vitest";
import { validateChoice } from "@/lib/store/postgres";

function queryForColor(color: "red" | "blue") {
  return (async (strings: TemplateStringsArray) => {
    const query = strings.join(" ");
    if (query.includes("from app.decisions")) return [];
    if (query.includes("from app.teams")) return [{ color }];
    throw new Error(`Неожиданный SQL в тесте: ${query}`);
  }) as unknown as TransactionSql;
}

describe("Postgres scenario choice validation", () => {
  it("validates the first red-team choice against the red scenario", async () => {
    await expect(
      validateChoice(queryForColor("red"), "session-1", "team-1", 0, "urgent-hire"),
    ).resolves.toMatchObject({ id: "red-q1-yakor-modernization" });
  });

  it("still rejects a choice from another color scenario", async () => {
    await expect(
      validateChoice(queryForColor("blue"), "session-1", "team-5", 0, "urgent-hire"),
    ).rejects.toThrow("Недопустимый вариант");
  });
});
