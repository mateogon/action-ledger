import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { CommandCenterError } from "./errors.js";
import { readMarkdown, writeMarkdown } from "./markdown.js";
import { archivedProjectPath, projectPath } from "./paths.js";
import {
  AREAS,
  PROJECT_STATUSES,
  TASK_PRIORITIES,
  ProjectFrontmatterSchema,
  type Area,
  type ProjectFrontmatter,
  type ProjectStatus,
  type TaskPriority
} from "./schemas.js";
import { makeId, nowIso } from "./utils.js";

export interface ProjectRecord {
  metadata: ProjectFrontmatter;
  body: string;
  path: string;
}

export interface ProjectInput {
  title: string;
  area?: Area;
  status?: ProjectStatus;
  priority?: TaskPriority;
  source_links?: string[];
  body?: string;
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

function assertIncluded(values: readonly string[], value: string, field: string): void {
  if (!values.includes(value)) {
    throw new CommandCenterError(`Invalid ${field}: ${value}`, "VALIDATION_ERROR", { field, value });
  }
}

export async function readProject(filePath: string): Promise<ProjectRecord> {
  const doc = await readMarkdown<unknown>(filePath);
  const parsed = ProjectFrontmatterSchema.safeParse(doc.data);
  if (!parsed.success) {
    throw new CommandCenterError(`Malformed project frontmatter: ${filePath}`, "MALFORMED_PROJECT", parsed.error.flatten());
  }
  return { metadata: parsed.data, body: doc.body, path: filePath };
}

export async function findProjectPath(dataDir: string, id: string): Promise<string> {
  const candidates = [projectPath(dataDir, id), archivedProjectPath(dataDir, id)];
  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }
  throw new CommandCenterError(`Project not found: ${id}`, "PROJECT_NOT_FOUND", { id });
}

export async function createProject(dataDir: string, input: ProjectInput): Promise<ProjectRecord> {
  const now = nowIso();
  const area = input.area ?? "other";
  const status = input.status ?? "active";
  const priority = input.priority ?? "medium";
  assertIncluded(AREAS, area, "area");
  assertIncluded(PROJECT_STATUSES, status, "status");
  assertIncluded(TASK_PRIORITIES, priority, "priority");

  const metadata = ProjectFrontmatterSchema.parse({
    schema_version: 1,
    id: makeId("project", input.title),
    title: input.title,
    area,
    status,
    priority,
    source_links: input.source_links ?? [],
    created_at: now,
    updated_at: now,
    archived_at: null
  });
  const target = projectPath(dataDir, metadata.id);
  await mkdir(path.dirname(target), { recursive: true });
  await writeMarkdown(target, metadata as unknown as Record<string, unknown>, input.body ?? "\n");
  return readProject(target);
}

export async function listProjects(dataDir: string): Promise<ProjectRecord[]> {
  const dir = path.join(dataDir, "projects");
  let entries: string[] = [];
  try {
    entries = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const projects: ProjectRecord[] = [];
  for (const entry of entries) {
    if (entry.endsWith(".md")) projects.push(await readProject(path.join(dir, entry)));
  }
  return projects.sort((a, b) => a.metadata.title.localeCompare(b.metadata.title));
}

export async function getProject(dataDir: string, id: string): Promise<ProjectRecord> {
  return readProject(await findProjectPath(dataDir, id));
}

export async function archiveProject(dataDir: string, id: string): Promise<ProjectRecord> {
  const currentPath = await findProjectPath(dataDir, id);
  const current = await readProject(currentPath);
  const nextMeta = ProjectFrontmatterSchema.parse({
    ...current.metadata,
    status: "archived",
    archived_at: nowIso(),
    updated_at: nowIso()
  });
  const nextPath = archivedProjectPath(dataDir, id);
  await mkdir(path.dirname(nextPath), { recursive: true });
  await writeMarkdown(currentPath, nextMeta as unknown as Record<string, unknown>, current.body);
  if (await pathExists(nextPath)) {
    throw new CommandCenterError(`Target archive path already exists: ${nextPath}`, "FILE_CONFLICT", { nextPath });
  }
  await rename(currentPath, nextPath);
  return readProject(nextPath);
}

export async function deleteProject(dataDir: string, id: string, confirm = false): Promise<{ id: string; deleted: true }> {
  if (!confirm) {
    throw new CommandCenterError("deleteProject requires confirm=true", "CONFIRMATION_REQUIRED", { id });
  }
  const target = await findProjectPath(dataDir, id);
  await rm(target);
  return { id, deleted: true };
}
