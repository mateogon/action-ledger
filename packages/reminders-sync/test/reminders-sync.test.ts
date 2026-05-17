import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { completeTask, createTask, initWorkspace, updateTask } from "@action-ledger/core";
import { planReminderSync, syncReminders, type ReminderProvider, type ReminderProviderInput } from "../src/index.js";

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "acc-reminders-test-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("reminders dry-run sync", () => {
  it("plans create actions for dated reminder-enabled tasks without apple_id", async () => {
    await withTempDir(async (dir) => {
      await initWorkspace({ dataDir: dir, writeGlobal: false });
      const task = await createTask(dir, {
        title: "Study communication docs",
        due: "2026-05-24",
        reminder: { enabled: true }
      });

      const result = await planReminderSync({ dataDir: dir, listName: "Action Ledger Test" });
      expect(result.actions).toEqual([
        {
          type: "create",
          task_id: task.metadata.id,
          title: "Study communication docs",
          due: "2026-05-24",
          apple_id: null,
          list_name: "Action Ledger Test"
        }
      ]);
    });
  });

  it("does not plan actions for tasks without due date or reminder enabled", async () => {
    await withTempDir(async (dir) => {
      await initWorkspace({ dataDir: dir, writeGlobal: false });
      await createTask(dir, { title: "No reminder", due: "2026-05-24" });
      await createTask(dir, { title: "No due", reminder: { enabled: true } });
      const result = await planReminderSync({ dataDir: dir });
      expect(result.actions).toHaveLength(0);
    });
  });

  it("plans update actions when apple_id exists", async () => {
    await withTempDir(async (dir) => {
      await initWorkspace({ dataDir: dir, writeGlobal: false });
      const task = await createTask(dir, {
        title: "Existing reminder",
        due: "2026-05-24",
        reminder: { enabled: true }
      });
      await updateTask(dir, task.metadata.id, { reminder: { enabled: true, apple_id: "apple-1" } });

      const result = await planReminderSync({ dataDir: dir });
      expect(result.actions[0]?.type).toBe("update");
      expect(result.actions[0]?.apple_id).toBe("apple-1");
    });
  });

  it("plans complete actions for completed tasks with apple_id", async () => {
    await withTempDir(async (dir) => {
      await initWorkspace({ dataDir: dir, writeGlobal: false });
      const task = await createTask(dir, {
        title: "Complete reminder",
        due: "2026-05-24",
        reminder: { enabled: true, apple_id: "apple-2" }
      });
      await completeTask(dir, task.metadata.id);

      const result = await planReminderSync({ dataDir: dir });
      expect(result.actions[0]?.type).toBe("complete");
    });
  });

  it("real sync applies create actions through a provider and stores apple_id", async () => {
    await withTempDir(async (dir) => {
      await initWorkspace({ dataDir: dir, writeGlobal: false });
      const task = await createTask(dir, {
        title: "Real sync via fake provider",
        due: "2026-05-24",
        reminder: { enabled: true }
      });
      const provider = new FakeReminderProvider();

      const result = await syncReminders({ dataDir: dir, dryRun: false, provider });
      expect(result.dry_run).toBe(false);
      expect(result.applied).toHaveLength(1);
      expect(result.applied?.[0]?.apple_id).toBe("fake-1");

      const updated = await planReminderSync({ dataDir: dir });
      expect(updated.actions[0]?.type).toBe("update");
      expect(updated.actions[0]?.apple_id).toBe("fake-1");
      expect(provider.created[0]?.title).toBe(task.metadata.title);
    });
  });

  it("real sync completes existing reminders through a provider", async () => {
    await withTempDir(async (dir) => {
      await initWorkspace({ dataDir: dir, writeGlobal: false });
      const task = await createTask(dir, {
        title: "Complete via provider",
        due: "2026-05-24",
        reminder: { enabled: true, apple_id: "fake-existing" }
      });
      await completeTask(dir, task.metadata.id);
      const provider = new FakeReminderProvider();

      const result = await syncReminders({ dataDir: dir, dryRun: false, provider });
      expect(result.applied?.[0]?.result).toBe("completed");
      expect(provider.completed).toEqual(["fake-existing"]);
    });
  });
});

class FakeReminderProvider implements ReminderProvider {
  created: ReminderProviderInput[] = [];
  updated: Array<ReminderProviderInput & { apple_id: string }> = [];
  completed: string[] = [];

  async createReminder(input: ReminderProviderInput): Promise<string> {
    this.created.push(input);
    return `fake-${this.created.length}`;
  }

  async updateReminder(input: ReminderProviderInput & { apple_id: string }): Promise<string> {
    this.updated.push(input);
    return input.apple_id;
  }

  async completeReminder(input: { apple_id: string }): Promise<void> {
    this.completed.push(input.apple_id);
  }
}
