import { execFile } from "node:child_process";
import {
  appendTaskLog,
  archiveTask,
  completeTask,
  createProject,
  createTask,
  deleteTask,
  getTask,
  initWorkspace,
  listProjects,
  listTasks,
  loadConfig,
  moveTask,
  writeGlobalConfig,
  type Area,
  type WorkspaceConfig,
  type TaskPriority,
  type TaskStatus
} from "@action-ledger/core";
import { asCommandCenterError } from "@action-ledger/core";
import { syncReminders } from "@action-ledger/reminders-sync";
import { flagBool, flagString, parseArgs } from "./args.js";
import { projectSummary, table, taskSummary } from "./format.js";

export interface CliIO {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

function writeJson(io: CliIO, value: unknown): void {
  io.stdout?.(JSON.stringify(value, null, 2));
}

function writeOutput(io: CliIO, value: unknown, json: boolean): void {
  if (json) {
    writeJson(io, value);
    return;
  }
  if (Array.isArray(value)) {
    io.stdout?.(table(value as Record<string, unknown>[]));
  } else if (typeof value === "object" && value !== null) {
    io.stdout?.(table([value as Record<string, unknown>]));
  } else {
    io.stdout?.(String(value));
  }
}

async function resolveDataDir(flags: Record<string, string | boolean>): Promise<string> {
  const explicit = flagString(flags, "data-dir");
  if (explicit) return explicit;
  const config = await loadConfig({ configPath: flagString(flags, "config-path") });
  return config.data_dir;
}

export async function runCli(args: string[], io: CliIO = {}): Promise<number> {
  const { positionals, flags } = parseArgs(args);
  const json = flagBool(flags, "json");
  const [domain, action, ...rest] = positionals;

  try {
    if (!domain || domain === "help" || flagBool(flags, "help")) {
      io.stdout?.(usage());
      return 0;
    }

    if (domain === "init") {
      const result = await initWorkspace({
        dataDir: flagString(flags, "data-dir"),
        configPath: flagString(flags, "config-path"),
        writeGlobal: !flagBool(flags, "no-global")
      });
      writeOutput(
        io,
        {
          data_dir: result.config.data_dir,
          global_config: result.globalConfigPath,
          workspace_config: result.workspaceConfigPath
        },
        json
      );
      return 0;
    }

    if (domain === "doctor") {
      const dataDir = await resolveDataDir(flags);
      const tasks = await listTasks(dataDir);
      const projects = await listProjects(dataDir);
      writeOutput(io, { data_dir: dataDir, tasks: tasks.length, projects: projects.length }, json);
      return 0;
    }

    if (domain === "config") {
      return await handleConfig(action, rest, flags, io, json);
    }

    if (domain === "open") {
      return await handleOpen(flags, io, json);
    }

    if (domain === "task") {
      return await handleTask(action, rest, flags, io, json);
    }

    if (domain === "project") {
      return await handleProject(action, rest, flags, io, json);
    }

    if (domain === "reminders") {
      return await handleReminders(action, flags, io, json);
    }

    io.stderr?.(`Unknown command: ${domain}`);
    return 1;
  } catch (error) {
    const err = asCommandCenterError(error);
    if (json) {
      writeJson(io, { error: { code: err.code, message: err.message, details: err.details } });
    } else {
      io.stderr?.(`${err.code}: ${err.message}`);
    }
    return 1;
  }
}

async function handleConfig(
  action: string | undefined,
  rest: string[],
  flags: Record<string, string | boolean>,
  io: CliIO,
  json: boolean
): Promise<number> {
  const configPath = flagString(flags, "config-path");
  const config = await loadConfig({ configPath });

  if (action === "get") {
    const key = rest[0];
    if (!key) {
      writeOutput(io, config, json);
      return 0;
    }
    writeOutput(io, getConfigValue(config, key), json);
    return 0;
  }

  if (action === "set") {
    const [key, value] = rest;
    if (!key || value === undefined) throw new Error("Usage: action-ledger config set <key> <value>");
    const updated = setConfigValue(config, key, value);
    await writeGlobalConfig(updated, { configPath });
    writeOutput(io, updated, json);
    return 0;
  }

  throw new Error(`Unknown config action: ${action ?? ""}`);
}

function getConfigValue(config: WorkspaceConfig, key: string): unknown {
  if (key === "data_dir") return config.data_dir;
  if (key === "reminders.enabled") return config.reminders.enabled;
  if (key === "reminders.list_name") return config.reminders.list_name;
  if (key === "desktop.autostart") return config.desktop.autostart;
  throw new Error(`Unsupported config key: ${key}`);
}

function setConfigValue(config: WorkspaceConfig, key: string, value: string): WorkspaceConfig {
  if (key === "data_dir") return { ...config, data_dir: value };
  if (key === "reminders.enabled") return { ...config, reminders: { ...config.reminders, enabled: value === "true" } };
  if (key === "reminders.list_name") return { ...config, reminders: { ...config.reminders, list_name: value } };
  if (key === "desktop.autostart") return { ...config, desktop: { ...config.desktop, autostart: value === "true" } };
  throw new Error(`Unsupported config key: ${key}`);
}

async function handleOpen(flags: Record<string, string | boolean>, io: CliIO, json: boolean): Promise<number> {
  const dataDir = await resolveDataDir(flags);
  if (flagBool(flags, "dry-run")) {
    writeOutput(io, { data_dir: dataDir, opened: false }, json);
    return 0;
  }
  await new Promise<void>((resolve, reject) => {
    const child = execFile("open", [dataDir], (error) => {
      if (error) reject(error);
      else resolve();
    });
    child.on("error", reject);
  });
  writeOutput(io, { data_dir: dataDir, opened: true }, json);
  return 0;
}

async function handleReminders(
  action: string | undefined,
  flags: Record<string, string | boolean>,
  io: CliIO,
  json: boolean
): Promise<number> {
  if (action !== "sync") {
    throw new Error(`Unknown reminders action: ${action ?? ""}`);
  }
  const dataDir = await resolveDataDir(flags);
  const result = await syncReminders({
    dataDir,
    dryRun: !flagBool(flags, "real"),
    listName: flagString(flags, "list-name")
  });
  writeOutput(io, result, json);
  return 0;
}

async function handleTask(
  action: string | undefined,
  rest: string[],
  flags: Record<string, string | boolean>,
  io: CliIO,
  json: boolean
): Promise<number> {
  const dataDir = await resolveDataDir(flags);
  if (action === "add") {
    const title = rest.join(" ").trim();
    if (!title) throw new Error("Task title is required");
    const task = await createTask(dataDir, {
      title,
      area: (flagString(flags, "area") as Area | undefined) ?? "other",
      project: flagString(flags, "project") ?? null,
      status: (flagString(flags, "status") as TaskStatus | undefined) ?? "inbox",
      priority: (flagString(flags, "priority") as TaskPriority | undefined) ?? "medium",
      due: flagString(flags, "due") ?? null,
      tags: flagString(flags, "tags")?.split(",").filter(Boolean) ?? [],
      reminder: {
        enabled: flagBool(flags, "reminder")
      },
      source_links: flagString(flags, "source") ? [flagString(flags, "source") as string] : [],
      body: flagString(flags, "body") ?? "\n"
    });
    writeOutput(io, taskSummary(task), json);
    return 0;
  }

  if (action === "list") {
    const tasks = await listTasks(dataDir, {
      status: flagString(flags, "status") as TaskStatus | undefined,
      area: flagString(flags, "area") as Area | undefined,
      project: flagString(flags, "project"),
      dueBefore: flagString(flags, "due-before")
    });
    writeOutput(io, tasks.map(taskSummary), json);
    return 0;
  }

  if (action === "show") {
    const id = rest[0];
    if (!id) throw new Error("Task id is required");
    writeOutput(io, taskSummary(await getTask(dataDir, id)), json);
    return 0;
  }

  if (action === "log") {
    const [id, ...messageParts] = rest;
    const message = messageParts.join(" ").trim();
    if (!id || !message) throw new Error("Usage: action-ledger task log <id> <message>");
    writeOutput(
      io,
      taskSummary(
        await appendTaskLog(dataDir, id, {
          message,
          author: flagString(flags, "author") ?? "Codex"
        })
      ),
      json
    );
    return 0;
  }

  if (action === "move") {
    const [id, status] = rest;
    if (!id || !status) throw new Error("Usage: action-ledger task move <id> <status>");
    writeOutput(io, taskSummary(await moveTask(dataDir, id, status as TaskStatus)), json);
    return 0;
  }

  if (action === "complete") {
    const id = rest[0];
    if (!id) throw new Error("Task id is required");
    writeOutput(io, taskSummary(await completeTask(dataDir, id)), json);
    return 0;
  }

  if (action === "archive") {
    const id = rest[0];
    if (!id) throw new Error("Task id is required");
    writeOutput(io, taskSummary(await archiveTask(dataDir, id)), json);
    return 0;
  }

  if (action === "delete") {
    const id = rest[0];
    if (!id) throw new Error("Task id is required");
    writeOutput(io, await deleteTask(dataDir, id, flagBool(flags, "confirm")), json);
    return 0;
  }

  throw new Error(`Unknown task action: ${action ?? ""}`);
}

async function handleProject(
  action: string | undefined,
  rest: string[],
  flags: Record<string, string | boolean>,
  io: CliIO,
  json: boolean
): Promise<number> {
  const dataDir = await resolveDataDir(flags);
  if (action === "add") {
    const title = rest.join(" ").trim();
    if (!title) throw new Error("Project title is required");
    const project = await createProject(dataDir, {
      title,
      area: (flagString(flags, "area") as Area | undefined) ?? "other",
      priority: (flagString(flags, "priority") as TaskPriority | undefined) ?? "medium",
      source_links: flagString(flags, "source") ? [flagString(flags, "source") as string] : []
    });
    writeOutput(io, projectSummary(project), json);
    return 0;
  }

  if (action === "list") {
    writeOutput(io, (await listProjects(dataDir)).map(projectSummary), json);
    return 0;
  }

  throw new Error(`Unknown project action: ${action ?? ""}`);
}

export function usage(): string {
  return [
    "Action Ledger",
    "",
    "Commands:",
    "  action-ledger init --data-dir <path>",
    "  action-ledger doctor",
    "  action-ledger config get",
    "  action-ledger config set data_dir <path>",
    "  action-ledger open",
    "  action-ledger task add \"Title\" --area learning --status next --due 2026-05-24",
    "  action-ledger task list --status next --due-before 2026-05-31 --json",
    "  action-ledger task log <id> \"Added context\" --author Codex",
    "  action-ledger task move <id> doing",
    "  action-ledger task complete <id>",
    "  action-ledger task archive <id>",
    "  action-ledger task delete <id> --confirm",
    "  action-ledger project add \"Title\" --area work",
    "  action-ledger project list",
    "  action-ledger reminders sync --json",
    "  action-ledger reminders sync --real --list-name \"Action Ledger\"",
    "",
    "`acc` is kept as a short alias."
  ].join("\n");
}
