import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { CommandCenterError } from "./errors.js";
import { readMarkdown, writeMarkdown } from "./markdown.js";
import { archivedTaskPath, taskLaneDir, taskPath } from "./paths.js";
import {
  AREAS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TaskFrontmatterSchema,
  type Area,
  type TaskFrontmatter,
  type TaskPriority,
  type TaskStatus
} from "./schemas.js";
import { makeId, normalizeNullable, nowIso } from "./utils.js";

export interface TaskRecord {
  metadata: TaskFrontmatter;
  body: string;
  path: string;
}

export interface TaskInput {
  title: string;
  area?: Area;
  project?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  due?: string | null;
  tags?: string[];
  reminder?: {
    enabled?: boolean;
    apple_id?: string | null;
  };
  source_links?: string[];
  body?: string;
}

export interface TaskFilters {
  status?: TaskStatus;
  area?: Area;
  project?: string;
  dueBefore?: string;
}

export interface TaskLogInput {
  message: string;
  author?: string;
  at?: string;
}

function assertEnum<T extends readonly string[]>(values: T, value: string, field: string): asserts value is T[number] {
  if (!values.includes(value)) {
    throw new CommandCenterError(`Invalid ${field}: ${value}`, "VALIDATION_ERROR", { field, value });
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function findTaskPath(dataDir: string, id: string): Promise<string> {
  const candidates = [
    ...TASK_STATUSES.map((status) => taskPath(dataDir, status, id)),
    archivedTaskPath(dataDir, id)
  ];
  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }
  throw new CommandCenterError(`Task not found: ${id}`, "TASK_NOT_FOUND", { id });
}

export async function readTask(filePath: string): Promise<TaskRecord> {
  const doc = await readMarkdown<unknown>(filePath);
  const parsed = TaskFrontmatterSchema.safeParse(doc.data);
  if (!parsed.success) {
    throw new CommandCenterError(`Malformed task frontmatter: ${filePath}`, "MALFORMED_TASK", parsed.error.flatten());
  }
  return {
    metadata: parsed.data,
    body: doc.body,
    path: filePath
  };
}

export async function getTask(dataDir: string, id: string): Promise<TaskRecord> {
  return readTask(await findTaskPath(dataDir, id));
}

export async function createTask(dataDir: string, input: TaskInput): Promise<TaskRecord> {
  const now = nowIso();
  const area = input.area ?? "other";
  const status = input.status ?? "inbox";
  const priority = input.priority ?? "medium";
  assertEnum(AREAS, area, "area");
  assertEnum(TASK_STATUSES, status, "status");
  assertEnum(TASK_PRIORITIES, priority, "priority");

  const metadata = TaskFrontmatterSchema.parse({
    schema_version: 1,
    id: makeId("task", input.title),
    title: input.title,
    area,
    project: normalizeNullable(input.project),
    status,
    priority,
    due: normalizeNullable(input.due),
    tags: input.tags ?? [],
    reminder: {
      enabled: input.reminder?.enabled ?? false,
      apple_id: input.reminder?.apple_id ?? null
    },
    source_links: input.source_links ?? [],
    created_at: now,
    updated_at: now,
    completed_at: null,
    archived_at: null
  });

  const target = taskPath(dataDir, metadata.status, metadata.id);
  await mkdir(path.dirname(target), { recursive: true });
  await writeMarkdown(target, metadata as unknown as Record<string, unknown>, input.body ?? "\n");
  return readTask(target);
}

export async function listTasks(dataDir: string, filters: TaskFilters = {}): Promise<TaskRecord[]> {
  const lanes = filters.status ? [filters.status] : TASK_STATUSES;
  const tasks: TaskRecord[] = [];
  for (const lane of lanes) {
    const dir = taskLaneDir(dataDir, lane);
    let entries: string[] = [];
    try {
      entries = await readdir(dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      const record = await readTask(path.join(dir, entry));
      if (filters.area && record.metadata.area !== filters.area) continue;
      if (filters.project && record.metadata.project !== filters.project) continue;
      if (filters.dueBefore && (!record.metadata.due || record.metadata.due > filters.dueBefore)) continue;
      tasks.push(record);
    }
  }
  return tasks.sort((a, b) => {
    const dueA = a.metadata.due ?? "9999-99-99";
    const dueB = b.metadata.due ?? "9999-99-99";
    return dueA.localeCompare(dueB) || a.metadata.created_at.localeCompare(b.metadata.created_at);
  });
}

export async function updateTask(dataDir: string, id: string, patch: Partial<TaskFrontmatter>, body?: string): Promise<TaskRecord> {
  const currentPath = await findTaskPath(dataDir, id);
  const current = await readTask(currentPath);
  const next = TaskFrontmatterSchema.parse({
    ...current.metadata,
    ...patch,
    id,
    updated_at: nowIso()
  });
  await writeMarkdown(currentPath, next as unknown as Record<string, unknown>, body ?? current.body);
  return readTask(currentPath);
}

export async function moveTask(dataDir: string, id: string, status: TaskStatus): Promise<TaskRecord> {
  assertEnum(TASK_STATUSES, status, "status");
  const currentPath = await findTaskPath(dataDir, id);
  const current = await readTask(currentPath);
  const nextMeta = TaskFrontmatterSchema.parse({
    ...current.metadata,
    status,
    archived_at: null,
    completed_at: status === "done" ? current.metadata.completed_at ?? nowIso() : current.metadata.completed_at,
    updated_at: nowIso()
  });
  const nextPath = taskPath(dataDir, status, id);
  await mkdir(path.dirname(nextPath), { recursive: true });
  await writeMarkdown(currentPath, nextMeta as unknown as Record<string, unknown>, current.body);
  if (currentPath !== nextPath) {
    if (await pathExists(nextPath)) {
      throw new CommandCenterError(`Target task path already exists: ${nextPath}`, "FILE_CONFLICT", { nextPath });
    }
    await rename(currentPath, nextPath);
  }
  return readTask(nextPath);
}

export async function completeTask(dataDir: string, id: string): Promise<TaskRecord> {
  return moveTask(dataDir, id, "done");
}

export async function archiveTask(dataDir: string, id: string): Promise<TaskRecord> {
  const currentPath = await findTaskPath(dataDir, id);
  const current = await readTask(currentPath);
  const nextMeta = TaskFrontmatterSchema.parse({
    ...current.metadata,
    archived_at: nowIso(),
    updated_at: nowIso()
  });
  const nextPath = archivedTaskPath(dataDir, id);
  await mkdir(path.dirname(nextPath), { recursive: true });
  await writeMarkdown(currentPath, nextMeta as unknown as Record<string, unknown>, current.body);
  if (await pathExists(nextPath)) {
    throw new CommandCenterError(`Target archive path already exists: ${nextPath}`, "FILE_CONFLICT", { nextPath });
  }
  await rename(currentPath, nextPath);
  return readTask(nextPath);
}

export async function deleteTask(dataDir: string, id: string, confirm = false): Promise<{ id: string; deleted: true }> {
  if (!confirm) {
    throw new CommandCenterError("deleteTask requires confirm=true", "CONFIRMATION_REQUIRED", { id });
  }
  const target = await findTaskPath(dataDir, id);
  await rm(target);
  return { id, deleted: true };
}

export async function linkTaskSource(dataDir: string, id: string, sourceLink: string): Promise<TaskRecord> {
  const task = await getTask(dataDir, id);
  const links = new Set(task.metadata.source_links);
  links.add(sourceLink);
  return updateTask(dataDir, id, { source_links: [...links] });
}

export async function appendTaskLog(dataDir: string, id: string, input: TaskLogInput): Promise<TaskRecord> {
  const message = input.message.trim().replace(/\s+/g, " ");
  if (!message) {
    throw new CommandCenterError("Task log message is required", "VALIDATION_ERROR", { field: "message" });
  }
  const task = await getTask(dataDir, id);
  const author = input.author?.trim() || "Codex";
  const at = input.at?.trim() || nowIso();
  const line = `- ${at} - ${author}: ${message}`;
  return updateTask(dataDir, id, {}, appendLogLine(task.body, line));
}

function appendLogLine(body: string, line: string): string {
  const normalized = body.trimEnd();
  const match = normalized.match(/^## Log\s*$/m);
  if (!match || match.index === undefined) {
    const prefix = normalized.length ? `${normalized}\n\n` : "";
    return `${prefix}## Log\n\n${line}\n`;
  }

  const headingEnd = match.index + match[0].length;
  const afterHeading = normalized.slice(headingEnd);
  const insertion = afterHeading.startsWith("\n\n") ? `\n${line}` : `\n\n${line}`;
  return `${normalized.slice(0, headingEnd)}${insertion}${afterHeading}\n`;
}
