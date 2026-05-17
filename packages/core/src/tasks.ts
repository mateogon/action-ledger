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

export interface TaskSearchOptions extends TaskFilters {
  query?: string;
  limit?: number;
}

export interface NextActionOptions {
  area?: Area;
  project?: string;
  limit?: number;
}

export interface WorkspaceSummaryOptions {
  today?: string;
  dueWithinDays?: number;
  limit?: number;
}

export interface TaskLogInput {
  message: string;
  author?: string;
  at?: string;
}

export interface TaskClaimInput {
  owner: string;
  at?: string;
  force?: boolean;
}

export interface ReleaseTaskInput {
  owner?: string;
  force?: boolean;
}

export interface CompactTaskSummary {
  id: string;
  title: string;
  area: Area;
  project: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due: string | null;
  tags: string[];
  claim: TaskFrontmatter["claim"];
  source_links: string[];
  path: string;
  last_log: string | null;
}

export interface WorkspaceSummary {
  data_dir: string;
  total_tasks: number;
  open_tasks: number;
  by_status: Record<TaskStatus, number>;
  by_area: Record<Area, number>;
  due_soon: CompactTaskSummary[];
  next_actions: CompactTaskSummary[];
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
    claim: null,
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

export async function searchTasks(dataDir: string, options: TaskSearchOptions = {}): Promise<CompactTaskSummary[]> {
  const query = normalizeSearchText(options.query ?? "");
  const tasks = await listTasks(dataDir, options);
  const matches = query ? tasks.filter((task) => searchableText(task).includes(query)) : tasks;
  return matches.slice(0, options.limit ?? 25).map(compactTaskSummary);
}

export async function getNextActions(dataDir: string, options: NextActionOptions = {}): Promise<CompactTaskSummary[]> {
  const tasks = (await listTasks(dataDir))
    .filter((task) => task.metadata.status !== "done")
    .filter((task) => (options.area ? task.metadata.area === options.area : true))
    .filter((task) => (options.project ? task.metadata.project === options.project : true))
    .sort(compareNextActions);
  return tasks.slice(0, options.limit ?? 10).map(compactTaskSummary);
}

export async function getWorkspaceSummary(
  dataDir: string,
  options: WorkspaceSummaryOptions = {}
): Promise<WorkspaceSummary> {
  const tasks = await listTasks(dataDir);
  const byStatus = Object.fromEntries(TASK_STATUSES.map((status) => [status, 0])) as Record<TaskStatus, number>;
  const byArea = Object.fromEntries(AREAS.map((area) => [area, 0])) as Record<Area, number>;
  for (const task of tasks) {
    byStatus[task.metadata.status] += 1;
    byArea[task.metadata.area] += 1;
  }

  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const dueLimit = addDays(today, options.dueWithinDays ?? 7);
  const dueSoon = tasks
    .filter((task) => task.metadata.status !== "done")
    .filter((task) => task.metadata.due !== null && task.metadata.due >= today && task.metadata.due <= dueLimit)
    .sort(compareDueThenCreated)
    .slice(0, options.limit ?? 10)
    .map(compactTaskSummary);

  return {
    data_dir: dataDir,
    total_tasks: tasks.length,
    open_tasks: tasks.filter((task) => task.metadata.status !== "done").length,
    by_status: byStatus,
    by_area: byArea,
    due_soon: dueSoon,
    next_actions: await getNextActions(dataDir, { limit: options.limit ?? 10 })
  };
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
    claim: status === "done" ? null : current.metadata.claim,
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

export async function claimTask(dataDir: string, id: string, input: TaskClaimInput): Promise<TaskRecord> {
  const owner = input.owner.trim();
  if (!owner) {
    throw new CommandCenterError("Task claim owner is required", "VALIDATION_ERROR", { field: "owner" });
  }
  const task = await getTask(dataDir, id);
  const current = task.metadata.claim;
  if (current && current.owner !== owner && !input.force) {
    throw new CommandCenterError(`Task already claimed by ${current.owner}`, "TASK_ALREADY_CLAIMED", {
      id,
      owner: current.owner
    });
  }
  return updateTask(dataDir, id, {
    claim: {
      owner,
      at: input.at?.trim() || nowIso()
    }
  });
}

export async function releaseTask(dataDir: string, id: string, input: ReleaseTaskInput = {}): Promise<TaskRecord> {
  const task = await getTask(dataDir, id);
  const current = task.metadata.claim;
  if (current && input.owner && current.owner !== input.owner && !input.force) {
    throw new CommandCenterError(`Task claimed by ${current.owner}`, "TASK_ALREADY_CLAIMED", { id, owner: current.owner });
  }
  return updateTask(dataDir, id, { claim: null });
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

function compactTaskSummary(task: TaskRecord): CompactTaskSummary {
  return {
    id: task.metadata.id,
    title: task.metadata.title,
    area: task.metadata.area,
    project: task.metadata.project,
    status: task.metadata.status,
    priority: task.metadata.priority,
    due: task.metadata.due,
    tags: task.metadata.tags,
    claim: task.metadata.claim,
    source_links: task.metadata.source_links,
    path: task.path,
    last_log: lastLogLine(task.body)
  };
}

function searchableText(task: TaskRecord): string {
  return normalizeSearchText(
    [
      task.metadata.title,
      task.metadata.area,
      task.metadata.project ?? "",
      task.metadata.status,
      task.metadata.priority,
      task.metadata.tags.join(" "),
      task.metadata.source_links.join(" "),
      task.body
    ].join(" ")
  );
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().normalize("NFKD");
}

function compareNextActions(a: TaskRecord, b: TaskRecord): number {
  const rank = (status: TaskStatus) => {
    if (status === "doing") return 0;
    if (status === "next") return 1;
    if (status === "waiting") return 2;
    if (status === "inbox") return 3;
    return 4;
  };
  return rank(a.metadata.status) - rank(b.metadata.status) || compareDueThenCreated(a, b);
}

function compareDueThenCreated(a: TaskRecord, b: TaskRecord): number {
  const dueA = a.metadata.due ?? "9999-99-99";
  const dueB = b.metadata.due ?? "9999-99-99";
  return dueA.localeCompare(dueB) || a.metadata.created_at.localeCompare(b.metadata.created_at);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function lastLogLine(body: string): string | null {
  const lines = body.split(/\r?\n/);
  const logIndex = lines.findIndex((line) => line.trim() === "## Log");
  if (logIndex === -1) return null;
  for (const line of lines.slice(logIndex + 1)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) return trimmed;
    if (trimmed.startsWith("## ")) return null;
  }
  return null;
}
