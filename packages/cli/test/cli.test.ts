import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/index.js";

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "acc-cli-test-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function run(args: string[]): Promise<{ code: number; stdout: string[]; stderr: string[] }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runCli(args, {
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text)
  });
  return { code, stdout, stderr };
}

function parseFirstJson(stdout: string[]): any {
  return JSON.parse(stdout[0] ?? "null");
}

describe("CLI", () => {
  it("init creates workspace and config", async () => {
    await withTempDir(async (dir) => {
      const dataDir = path.join(dir, "data");
      const configPath = path.join(dir, "config.yaml");
      const result = await run(["init", "--data-dir", dataDir, "--config-path", configPath, "--json"]);
      expect(result.code).toBe(0);
      expect(parseFirstJson(result.stdout).data_dir).toBe(dataDir);
    });
  });

  it("adds, lists, moves, and completes tasks", async () => {
    await withTempDir(async (dir) => {
      const dataDir = path.join(dir, "data");
      await run(["init", "--data-dir", dataDir, "--config-path", path.join(dir, "config.yaml"), "--json"]);

      const added = await run([
        "task",
        "add",
        "Semana 1 memo",
        "--data-dir",
        dataDir,
        "--area",
        "learning",
        "--status",
        "next",
        "--due",
        "2026-05-24",
        "--json"
      ]);
      expect(added.code).toBe(0);
      const task = parseFirstJson(added.stdout);
      expect(task.status).toBe("next");

      const listed = await run(["task", "list", "--data-dir", dataDir, "--status", "next", "--json"]);
      expect(parseFirstJson(listed.stdout)).toHaveLength(1);

      const moved = await run(["task", "move", task.id, "doing", "--data-dir", dataDir, "--json"]);
      expect(parseFirstJson(moved.stdout).status).toBe("doing");

      const completed = await run(["task", "complete", task.id, "--data-dir", dataDir, "--json"]);
      expect(parseFirstJson(completed.stdout).status).toBe("done");
    });
  });

  it("lists tasks due before a requested date", async () => {
    await withTempDir(async (dir) => {
      const dataDir = path.join(dir, "data");
      await run(["init", "--data-dir", dataDir, "--no-global"]);
      await run(["task", "add", "Due soon", "--data-dir", dataDir, "--status", "next", "--due", "2026-05-24"]);
      await run(["task", "add", "Due later", "--data-dir", dataDir, "--status", "next", "--due", "2026-06-15"]);
      await run(["task", "add", "No date", "--data-dir", dataDir, "--status", "next"]);

      const listed = await run(["task", "list", "--data-dir", dataDir, "--due-before", "2026-05-31", "--json"]);
      expect(parseFirstJson(listed.stdout).map((task: { title: string }) => task.title)).toEqual(["Due soon"]);
    });
  });

  it("appends task log entries", async () => {
    await withTempDir(async (dir) => {
      const dataDir = path.join(dir, "data");
      await run(["init", "--data-dir", dataDir, "--no-global"]);
      const added = await run(["task", "add", "Log target", "--data-dir", dataDir, "--json"]);
      const task = parseFirstJson(added.stdout);

      const logged = await run([
        "task",
        "log",
        task.id,
        "Captured useful context",
        "--author",
        "Codex",
        "--data-dir",
        dataDir,
        "--json"
      ]);
      expect(logged.code).toBe(0);

      const shown = parseFirstJson((await run(["task", "show", task.id, "--data-dir", dataDir, "--json"])).stdout);
      expect(shown.id).toBe(task.id);
      expect(await readFile(shown.path, "utf8")).toContain("Captured useful context");
    });
  });

  it("doctor detects an initialized workspace", async () => {
    await withTempDir(async (dir) => {
      const dataDir = path.join(dir, "data");
      await run(["init", "--data-dir", dataDir, "--no-global"]);
      const doctor = await run(["doctor", "--data-dir", dataDir, "--json"]);
      expect(doctor.code).toBe(0);
      expect(parseFirstJson(doctor.stdout)).toMatchObject({ data_dir: dataDir, tasks: 0, projects: 0 });
    });
  });

  it("gets and sets config values", async () => {
    await withTempDir(async (dir) => {
      const dataDir = path.join(dir, "data");
      const configPath = path.join(dir, "config.yaml");
      await run(["init", "--data-dir", dataDir, "--config-path", configPath]);

      const before = await run(["config", "get", "data_dir", "--config-path", configPath, "--json"]);
      expect(parseFirstJson(before.stdout)).toBe(dataDir);

      const nextDir = path.join(dir, "next-data");
      const updated = await run(["config", "set", "data_dir", nextDir, "--config-path", configPath, "--json"]);
      expect(parseFirstJson(updated.stdout).data_dir).toBe(nextDir);
    });
  });

  it("open supports dry-run for tests and agents", async () => {
    await withTempDir(async (dir) => {
      const dataDir = path.join(dir, "data");
      const configPath = path.join(dir, "config.yaml");
      await run(["init", "--data-dir", dataDir, "--config-path", configPath]);
      const result = await run(["open", "--config-path", configPath, "--dry-run", "--json"]);
      expect(parseFirstJson(result.stdout)).toEqual({ data_dir: dataDir, opened: false });
    });
  });

  it("delete refuses to run without confirmation", async () => {
    await withTempDir(async (dir) => {
      const dataDir = path.join(dir, "data");
      await run(["init", "--data-dir", dataDir, "--no-global"]);
      const added = await run(["task", "add", "Delete me", "--data-dir", dataDir, "--json"]);
      const task = parseFirstJson(added.stdout);
      const deleted = await run(["task", "delete", task.id, "--data-dir", dataDir, "--json"]);
      expect(deleted.code).toBe(1);
      expect(parseFirstJson(deleted.stdout).error.code).toBe("CONFIRMATION_REQUIRED");
    });
  });

  it("plans reminders sync from the CLI", async () => {
    await withTempDir(async (dir) => {
      const dataDir = path.join(dir, "data");
      await run(["init", "--data-dir", dataDir, "--no-global"]);
      await run([
        "task",
        "add",
        "Reminder CLI",
        "--data-dir",
        dataDir,
        "--due",
        "2026-05-24",
        "--reminder"
      ]);

      const result = await run(["reminders", "sync", "--data-dir", dataDir, "--json"]);
      expect(result.code).toBe(0);
      const payload = parseFirstJson(result.stdout);
      expect(payload.dry_run).toBe(true);
      expect(payload.actions[0].type).toBe("create");
    });
  });
});
