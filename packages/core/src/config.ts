import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { CommandCenterError } from "./errors.js";
import { defaultDataDir, defaultGlobalConfigPath, legacyGlobalConfigPath, workspaceConfigPath } from "./paths.js";
import { WorkspaceConfigSchema, type WorkspaceConfig } from "./schemas.js";

export interface LoadConfigOptions {
  configPath?: string;
  dataDir?: string;
  homeDir?: string;
}

export interface WriteConfigOptions {
  configPath?: string;
  homeDir?: string;
}

export function makeDefaultConfig(dataDir?: string, homeDir?: string): WorkspaceConfig {
  return WorkspaceConfigSchema.parse({
    data_dir: dataDir ?? defaultDataDir(homeDir),
    reminders: {
      enabled: false,
      list_name: "Action Ledger"
    },
    desktop: {
      autostart: false
    }
  });
}

export async function loadConfig(options: LoadConfigOptions = {}): Promise<WorkspaceConfig> {
  if (options.dataDir) {
    return makeDefaultConfig(options.dataDir, options.homeDir);
  }

  const configPath = options.configPath ?? process.env.ACTION_LEDGER_CONFIG_PATH ?? process.env.ACC_CONFIG_PATH ?? await readableConfigPath(options.homeDir);
  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = YAML.parse(raw) as unknown;
    return WorkspaceConfigSchema.parse(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new CommandCenterError(`Config not found: ${configPath}`, "CONFIG_NOT_FOUND", { configPath });
    }
    throw error;
  }
}

export async function writeGlobalConfig(config: WorkspaceConfig, options: WriteConfigOptions = {}): Promise<string> {
  const configPath = options.configPath ?? process.env.ACTION_LEDGER_CONFIG_PATH ?? process.env.ACC_CONFIG_PATH ?? defaultGlobalConfigPath(options.homeDir);
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, YAML.stringify(config), "utf8");
  return configPath;
}

async function readableConfigPath(homeDir?: string): Promise<string> {
  const current = defaultGlobalConfigPath(homeDir);
  if (await pathExists(current)) return current;
  const legacy = legacyGlobalConfigPath(homeDir);
  if (await pathExists(legacy)) return legacy;
  return current;
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

export async function writeWorkspaceConfig(config: WorkspaceConfig): Promise<string> {
  const target = workspaceConfigPath(config.data_dir);
  await writeFile(target, YAML.stringify(config), "utf8");
  return target;
}
