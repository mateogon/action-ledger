import os from "node:os";
import path from "node:path";
import { TASK_STATUSES, type TaskStatus } from "./schemas.js";

export const APP_DIR_NAME = ".action-ledger";
export const LEGACY_APP_DIR_NAME = ".agent-command-center";
export const WORKSPACE_DIR_NAME = "Action Ledger";

export function defaultGlobalConfigPath(homeDir = os.homedir()): string {
  return path.join(homeDir, APP_DIR_NAME, "config.yaml");
}

export function legacyGlobalConfigPath(homeDir = os.homedir()): string {
  return path.join(homeDir, LEGACY_APP_DIR_NAME, "config.yaml");
}

export function defaultDataDir(homeDir = os.homedir()): string {
  return path.join(homeDir, "Documents", WORKSPACE_DIR_NAME);
}

export function workspaceConfigPath(dataDir: string): string {
  return path.join(dataDir, "config.yaml");
}

export function taskLaneDir(dataDir: string, status: TaskStatus): string {
  return path.join(dataDir, "tasks", status);
}

export function taskPath(dataDir: string, status: TaskStatus, id: string): string {
  return path.join(taskLaneDir(dataDir, status), `${id}.md`);
}

export function projectPath(dataDir: string, id: string): string {
  return path.join(dataDir, "projects", `${id}.md`);
}

export function archivedTaskPath(dataDir: string, id: string): string {
  return path.join(dataDir, "archive", "tasks", `${id}.md`);
}

export function archivedProjectPath(dataDir: string, id: string): string {
  return path.join(dataDir, "archive", "projects", `${id}.md`);
}

export function workspaceDirs(dataDir: string): string[] {
  return [
    path.join(dataDir, "tasks"),
    ...TASK_STATUSES.map((status) => taskLaneDir(dataDir, status)),
    path.join(dataDir, "projects"),
    path.join(dataDir, "archive"),
    path.join(dataDir, "archive", "tasks"),
    path.join(dataDir, "archive", "projects"),
    path.join(dataDir, "templates")
  ];
}
