import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendTaskLog,
  archiveTask,
  completeTask,
  createProject,
  createTask,
  deleteTask,
  getTask,
  initWorkspace,
  linkTaskSource,
  listProjects,
  listTasks,
  loadConfig,
  moveTask,
  taskPath,
  workspaceConfigPath,
  type TaskStatus
} from "../src/index.js";
import { withTempDir } from "./helpers.js";

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

describe("workspace", () => {
  it("initWorkspace creates the expected directory tree and config files", async () => {
    await withTempDir(async (dir) => {
      const dataDir = path.join(dir, "data");
      const configPath = path.join(dir, "global", "config.yaml");
      const result = await initWorkspace({ dataDir, configPath });

      expect(result.config.data_dir).toBe(dataDir);
      expect(await exists(workspaceConfigPath(dataDir))).toBe(true);
      expect(await exists(configPath)).toBe(true);

      for (const lane of ["inbox", "next", "doing", "waiting", "done"] satisfies TaskStatus[]) {
        expect(await exists(path.join(dataDir, "tasks", lane))).toBe(true);
      }
      expect(await exists(path.join(dataDir, "projects"))).toBe(true);
      expect(await exists(path.join(dataDir, "archive", "tasks"))).toBe(true);
    });
  });

  it("initWorkspace is idempotent", async () => {
    await withTempDir(async (dir) => {
      const dataDir = path.join(dir, "data");
      await initWorkspace({ dataDir, configPath: path.join(dir, "config.yaml") });
      await initWorkspace({ dataDir, configPath: path.join(dir, "config.yaml") });
      expect(await exists(path.join(dataDir, "tasks", "inbox"))).toBe(true);
    });
  });

  it("loadConfig reads an explicit config path", async () => {
    await withTempDir(async (dir) => {
      const dataDir = path.join(dir, "data");
      const configPath = path.join(dir, "config.yaml");
      await initWorkspace({ dataDir, configPath });
      const config = await loadConfig({ configPath });
      expect(config.data_dir).toBe(dataDir);
    });
  });
});

describe("tasks", () => {
  it("createTask writes a valid Markdown task", async () => {
    await withTempDir(async (dir) => {
      await initWorkspace({ dataDir: dir, writeGlobal: false });
      const task = await createTask(dir, {
        title: "Write memo",
        area: "learning",
        project: "communication",
        status: "next",
        priority: "high",
        due: "2026-05-24",
        body: "## Objective\n\nWrite a memo.\n"
      });

      expect(task.metadata.title).toBe("Write memo");
      expect(task.metadata.status).toBe("next");
      expect(await exists(taskPath(dir, "next", task.metadata.id))).toBe(true);

      const raw = await readFile(task.path, "utf8");
      expect(raw).toContain("area: learning");
      expect(raw).toContain("## Objective");
    });
  });

  it("createTask rejects invalid status/area/priority", async () => {
    await withTempDir(async (dir) => {
      await initWorkspace({ dataDir: dir, writeGlobal: false });
      await expect(
        createTask(dir, {
          title: "Bad task",
          area: "invalid" as never
        })
      ).rejects.toThrow(/Invalid area/);
    });
  });

  it("listTasks reads all lanes and filters by area", async () => {
    await withTempDir(async (dir) => {
      await initWorkspace({ dataDir: dir, writeGlobal: false });
      await createTask(dir, { title: "Work task", area: "work", status: "next" });
      await createTask(dir, { title: "Learning task", area: "learning", status: "doing" });

      expect(await listTasks(dir)).toHaveLength(2);
      const learning = await listTasks(dir, { area: "learning" });
      expect(learning).toHaveLength(1);
      expect(learning[0]?.metadata.title).toBe("Learning task");
    });
  });

  it("listTasks filters dated tasks due on or before a date", async () => {
    await withTempDir(async (dir) => {
      await initWorkspace({ dataDir: dir, writeGlobal: false });
      await createTask(dir, { title: "Due soon", status: "next", due: "2026-05-24" });
      await createTask(dir, { title: "Due later", status: "next", due: "2026-06-01" });
      await createTask(dir, { title: "No due date", status: "next" });

      const dueSoon = await listTasks(dir, { dueBefore: "2026-05-31" });
      expect(dueSoon.map((task) => task.metadata.title)).toEqual(["Due soon"]);
    });
  });

  it("moveTask changes status, file location, and preserves body content", async () => {
    await withTempDir(async (dir) => {
      await initWorkspace({ dataDir: dir, writeGlobal: false });
      const task = await createTask(dir, {
        title: "Move me",
        status: "next",
        body: "Original body\n"
      });
      const moved = await moveTask(dir, task.metadata.id, "doing");

      expect(moved.metadata.status).toBe("doing");
      expect(moved.body).toContain("Original body");
      expect(await exists(taskPath(dir, "next", task.metadata.id))).toBe(false);
      expect(await exists(taskPath(dir, "doing", task.metadata.id))).toBe(true);
    });
  });

  it("completeTask moves a task to done and sets completed_at", async () => {
    await withTempDir(async (dir) => {
      await initWorkspace({ dataDir: dir, writeGlobal: false });
      const task = await createTask(dir, { title: "Finish me", status: "doing" });
      const completed = await completeTask(dir, task.metadata.id);
      expect(completed.metadata.status).toBe("done");
      expect(completed.metadata.completed_at).toBeTruthy();
    });
  });

  it("archiveTask moves a task into archive", async () => {
    await withTempDir(async (dir) => {
      await initWorkspace({ dataDir: dir, writeGlobal: false });
      const task = await createTask(dir, { title: "Archive me", status: "done" });
      const archived = await archiveTask(dir, task.metadata.id);
      expect(archived.path).toContain(path.join("archive", "tasks"));
      expect(archived.metadata.archived_at).toBeTruthy();
    });
  });

  it("deleteTask requires explicit confirmation", async () => {
    await withTempDir(async (dir) => {
      await initWorkspace({ dataDir: dir, writeGlobal: false });
      const task = await createTask(dir, { title: "Delete me" });
      await expect(deleteTask(dir, task.metadata.id)).rejects.toThrow(/confirm=true/);
      await expect(deleteTask(dir, task.metadata.id, true)).resolves.toMatchObject({ deleted: true });
    });
  });

  it("linkTaskSource stores source links without copying files", async () => {
    await withTempDir(async (dir) => {
      await initWorkspace({ dataDir: dir, writeGlobal: false });
      const source = path.join(dir, "outside-note.md");
      await writeFile(source, "source");
      const task = await createTask(dir, { title: "Link me" });
      const linked = await linkTaskSource(dir, task.metadata.id, source);
      expect(linked.metadata.source_links).toContain(source);
    });
  });

  it("appendTaskLog records newest log entries in the task body", async () => {
    await withTempDir(async (dir) => {
      await initWorkspace({ dataDir: dir, writeGlobal: false });
      const task = await createTask(dir, {
        title: "Log me",
        body: "## Objective\n\nKeep a useful trail.\n"
      });
      const first = await appendTaskLog(dir, task.metadata.id, {
        message: "Created initial task",
        author: "Codex",
        at: "2026-05-17T10:00:00.000Z"
      });
      const second = await appendTaskLog(dir, task.metadata.id, {
        message: "Moved from idea to next action",
        author: "Mateo",
        at: "2026-05-17T11:00:00.000Z"
      });

      expect(first.body).toContain("## Log");
      expect(second.body.indexOf("Moved from idea")).toBeLessThan(second.body.indexOf("Created initial task"));
      expect(second.body).toContain("- 2026-05-17T11:00:00.000Z - Mateo: Moved from idea to next action");
    });
  });

  it("malformed frontmatter produces a useful error", async () => {
    await withTempDir(async (dir) => {
      await initWorkspace({ dataDir: dir, writeGlobal: false });
      const badPath = taskPath(dir, "next", "bad");
      await mkdir(path.dirname(badPath), { recursive: true });
      await writeFile(badPath, "---\nid: bad\nstatus: wrong\n---\nbody\n");
      await expect(getTask(dir, "bad")).rejects.toMatchObject({ code: "MALFORMED_TASK" });
    });
  });
});

describe("projects", () => {
  it("creates and lists projects", async () => {
    await withTempDir(async (dir) => {
      await initWorkspace({ dataDir: dir, writeGlobal: false });
      const project = await createProject(dir, {
        title: "Communication Systems",
        area: "learning",
        priority: "high"
      });
      expect(project.metadata.area).toBe("learning");

      const projects = await listProjects(dir);
      expect(projects).toHaveLength(1);
      expect(projects[0]?.metadata.title).toBe("Communication Systems");
    });
  });
});

describe("sample workspace fixture", () => {
  it("supports realistic list, due-soon, complete, and archive workflows", async () => {
    await withTempDir(async (dir) => {
      const fixture = path.join(dir, "sample-workspace");
      await cp(path.resolve("examples/sample-workspace"), fixture, { recursive: true });

      expect(await listTasks(fixture)).toHaveLength(7);
      expect((await listTasks(fixture, { area: "work" })).map((task) => task.metadata.id)).toEqual([
        "task_demo_work_adr"
      ]);
      expect(await listTasks(fixture, { project: "project_demo_communication" })).toHaveLength(4);
      expect((await listTasks(fixture, { status: "next", dueBefore: "2026-05-31" })).map((task) => task.metadata.id)).toEqual([
        "task_demo_week_1_memo",
        "task_demo_week_2_diagram"
      ]);

      const completed = await completeTask(fixture, "task_demo_work_adr");
      expect(completed.metadata.status).toBe("done");
      const archived = await archiveTask(fixture, "task_demo_work_adr");
      expect(archived.metadata.source_links).toContain("/example/repos/work-ops/docs/retry-policy.md");
      expect(archived.path).toContain(path.join("archive", "tasks"));
    });
  });
});
