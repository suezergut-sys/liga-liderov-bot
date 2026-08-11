import { describe, expect, it } from "vitest";
import { SnapshotRequestGuard } from "@/lib/snapshot-request-guard";

describe("SnapshotRequestGuard", () => {
  it("does not let an older dashboard poll overwrite a completed action", () => {
    const guard = new SnapshotRequestGuard();
    const poll = guard.beginRead()!;
    const action = guard.beginMutation();

    expect(guard.isCurrent(poll)).toBe(false);
    expect(guard.isCurrent(action)).toBe(true);
    expect(guard.beginRead()).toBeUndefined();

    guard.endMutation(action);
    expect(guard.beginRead()).toBeDefined();
  });
});
