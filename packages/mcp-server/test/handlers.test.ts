import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createToolHandlers } from "../src/handlers.js";

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "acc-mcp-test-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("MCP tool handlers", () => {
  it("initializes workspace and reports status", async () => {
    await withTempDir(async (dir) => {
      const handlers = createToolHandlers();
      await handlers.init_workspace({ data_dir: dir, write_global: false });
      const status = await handlers.get_workspace_status({ data_dir: dir });
      expect(status).toMatchObject({ data_dir: dir, tasks: 0, projects: 0 });
    });
  });

  it("creates, lists, moves, completes, and archives tasks", async () => {
    await withTempDir(async (dir) => {
      const handlers = createToolHandlers();
      await handlers.init_workspace({ data_dir: dir, write_global: false });
      const task = await handlers.create_task({
        data_dir: dir,
        title: "Study docs",
        area: "learning",
        status: "next",
        due: "2026-05-24",
        reminder_enabled: true
      });

      expect(task.status).toBe("next");
      expect(await handlers.list_tasks({ data_dir: dir, status: "next" })).toHaveLength(1);

      const moved = await handlers.move_task({ data_dir: dir, id: task.id, status: "doing" });
      expect(moved.status).toBe("doing");

      const completed = await handlers.complete_task({ data_dir: dir, id: task.id });
      expect(completed.status).toBe("done");

      const archived = await handlers.archive_task({ data_dir: dir, id: task.id });
      expect(String(archived.path)).toContain(path.join("archive", "tasks"));
    });
  });

  it("delete_task requires confirm true", async () => {
    await withTempDir(async (dir) => {
      const handlers = createToolHandlers();
      await handlers.init_workspace({ data_dir: dir, write_global: false });
      const task = await handlers.create_task({ data_dir: dir, title: "Delete me" });
      await expect(handlers.delete_task({ data_dir: dir, id: task.id })).rejects.toMatchObject({
        code: "CONFIRMATION_REQUIRED"
      });
    });
  });

  it("creates projects and links sources to tasks", async () => {
    await withTempDir(async (dir) => {
      const handlers = createToolHandlers();
      await handlers.init_workspace({ data_dir: dir, write_global: false });
      const project = await handlers.create_project({ data_dir: dir, title: "Communication", area: "learning" });
      expect(project.area).toBe("learning");
      expect(await handlers.list_projects({ data_dir: dir })).toHaveLength(1);
      expect((await handlers.get_project({ data_dir: dir, id: project.id })).title).toBe("Communication");

      const task = await handlers.create_task({ data_dir: dir, title: "Link source" });
      const linked = await handlers.link_source({ data_dir: dir, id: task.id, source_link: "/tmp/source.md" });
      expect(linked.source_links).toContain("/tmp/source.md");
    });
  });

  it("appends task log entries for agent progress tracking", async () => {
    await withTempDir(async (dir) => {
      const handlers = createToolHandlers();
      await handlers.init_workspace({ data_dir: dir, write_global: false });
      const task = await handlers.create_task({ data_dir: dir, title: "Log source" });
      const logged = await handlers.append_task_log({
        data_dir: dir,
        id: task.id,
        message: "Captured implementation decision",
        author: "Codex",
        at: "2026-05-17T10:00:00.000Z"
      });
      expect(String(logged.body)).toContain("## Log");
      expect(String(logged.body)).toContain("Captured implementation decision");
    });
  });

  it("filters tasks by due date for due-soon agent queries", async () => {
    await withTempDir(async (dir) => {
      const handlers = createToolHandlers();
      await handlers.init_workspace({ data_dir: dir, write_global: false });
      await handlers.create_task({ data_dir: dir, title: "Due soon", status: "next", due: "2026-05-24" });
      await handlers.create_task({ data_dir: dir, title: "Due later", status: "next", due: "2026-06-24" });
      await handlers.create_task({ data_dir: dir, title: "No date", status: "next" });

      const tasks = await handlers.list_tasks({ data_dir: dir, due_before: "2026-05-31" });
      expect(tasks.map((task) => task.title)).toEqual(["Due soon"]);
    });
  });

  it("sync_reminders returns dry-run actions", async () => {
    await withTempDir(async (dir) => {
      const handlers = createToolHandlers();
      await handlers.init_workspace({ data_dir: dir, write_global: false });
      await handlers.create_task({
        data_dir: dir,
        title: "Reminder task",
        due: "2026-05-24",
        reminder_enabled: true
      });
      const result = await handlers.sync_reminders({ data_dir: dir, dry_run: true });
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0]?.type).toBe("create");
    });
  });
});
