import { mkdir } from "node:fs/promises";
import { makeDefaultConfig, writeGlobalConfig, writeWorkspaceConfig } from "./config.js";
import { workspaceDirs } from "./paths.js";
import type { WorkspaceConfig } from "./schemas.js";

export interface InitWorkspaceOptions {
  dataDir?: string;
  configPath?: string;
  writeGlobal?: boolean;
  homeDir?: string;
}

export interface InitWorkspaceResult {
  config: WorkspaceConfig;
  globalConfigPath: string | null;
  workspaceConfigPath: string;
  createdDirs: string[];
}

export async function initWorkspace(options: InitWorkspaceOptions = {}): Promise<InitWorkspaceResult> {
  const config = makeDefaultConfig(options.dataDir, options.homeDir);
  const dirs = workspaceDirs(config.data_dir);

  await mkdir(config.data_dir, { recursive: true });
  for (const dir of dirs) {
    await mkdir(dir, { recursive: true });
  }

  const workspaceConfigFile = await writeWorkspaceConfig(config);
  const shouldWriteGlobal = options.writeGlobal ?? true;
  const globalConfigPath = shouldWriteGlobal
    ? await writeGlobalConfig(config, { configPath: options.configPath, homeDir: options.homeDir })
    : null;

  return {
    config,
    globalConfigPath,
    workspaceConfigPath: workspaceConfigFile,
    createdDirs: dirs
  };
}

export async function getWorkspaceStatus(dataDir: string): Promise<{
  dataDir: string;
  expectedDirs: string[];
}> {
  return {
    dataDir,
    expectedDirs: workspaceDirs(dataDir)
  };
}
