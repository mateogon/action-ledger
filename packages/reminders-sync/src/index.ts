import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { CommandCenterError, listTasks, updateTask, type TaskRecord } from "@action-ledger/core";

const execFile = promisify(execFileCallback);

export type ReminderActionType = "create" | "update" | "complete";

export interface ReminderAction {
  type: ReminderActionType;
  task_id: string;
  title: string;
  due: string | null;
  apple_id: string | null;
  list_name: string;
}

export interface ReminderProvider {
  createReminder(input: ReminderProviderInput): Promise<string>;
  updateReminder(input: ReminderProviderInput & { apple_id: string }): Promise<string>;
  completeReminder(input: { apple_id: string; list_name: string }): Promise<void>;
}

export interface ReminderProviderInput {
  title: string;
  due: string;
  notes: string;
  list_name: string;
}

export interface SyncRemindersOptions {
  dataDir: string;
  listName?: string;
  dryRun?: boolean;
  provider?: ReminderProvider;
}

export interface SyncRemindersResult {
  dry_run: boolean;
  list_name: string;
  actions: ReminderAction[];
  applied?: ReminderAppliedAction[];
}

export interface ReminderAppliedAction extends ReminderAction {
  result: "created" | "updated" | "completed";
  apple_id: string | null;
}

export function reminderActionForTask(task: TaskRecord, listName: string): ReminderAction | null {
  const reminder = task.metadata.reminder;
  if (!reminder.enabled || !task.metadata.due) return null;

  if (task.metadata.status === "done") {
    if (!reminder.apple_id) return null;
    return {
      type: "complete",
      task_id: task.metadata.id,
      title: task.metadata.title,
      due: task.metadata.due,
      apple_id: reminder.apple_id,
      list_name: listName
    };
  }

  return {
    type: reminder.apple_id ? "update" : "create",
    task_id: task.metadata.id,
    title: task.metadata.title,
    due: task.metadata.due,
    apple_id: reminder.apple_id,
    list_name: listName
  };
}

export async function planReminderSync(options: SyncRemindersOptions): Promise<SyncRemindersResult> {
  const listName = options.listName ?? "Action Ledger";
  const tasks = await listTasks(options.dataDir);
  const actions = tasks
    .map((task) => reminderActionForTask(task, listName))
    .filter((action): action is ReminderAction => action !== null);

  return {
    dry_run: true,
    list_name: listName,
    actions
  };
}

export async function syncReminders(options: SyncRemindersOptions): Promise<SyncRemindersResult> {
  if (options.dryRun ?? true) {
    return planReminderSync(options);
  }

  const listName = options.listName ?? "Action Ledger";
  const tasks = await listTasks(options.dataDir);
  const taskById = new Map(tasks.map((task) => [task.metadata.id, task]));
  const planned = await planReminderSync({ ...options, listName, dryRun: true });
  const provider = options.provider ?? new AppleScriptReminderProvider();
  const applied: ReminderAppliedAction[] = [];

  for (const action of planned.actions) {
    const task = taskById.get(action.task_id);
    if (!task) continue;
    const notes = reminderNotes(task);

    if (action.type === "create") {
      if (!action.due) continue;
      const appleId = await provider.createReminder({
        title: action.title,
        due: action.due,
        notes,
        list_name: action.list_name
      });
      await updateTask(options.dataDir, action.task_id, {
        reminder: { enabled: true, apple_id: appleId }
      });
      applied.push({ ...action, result: "created", apple_id: appleId });
      continue;
    }

    if (action.type === "update") {
      if (!action.due || !action.apple_id) continue;
      const appleId = await provider.updateReminder({
        apple_id: action.apple_id,
        title: action.title,
        due: action.due,
        notes,
        list_name: action.list_name
      });
      if (appleId !== action.apple_id) {
        await updateTask(options.dataDir, action.task_id, {
          reminder: { enabled: true, apple_id: appleId }
        });
      }
      applied.push({ ...action, result: "updated", apple_id: appleId });
      continue;
    }

    if (action.type === "complete") {
      if (!action.apple_id) continue;
      await provider.completeReminder({ apple_id: action.apple_id, list_name: action.list_name });
      applied.push({ ...action, result: "completed", apple_id: action.apple_id });
    }
  }

  return {
    dry_run: false,
    list_name: listName,
    actions: planned.actions,
    applied
  };
}

export function reminderNotes(task: TaskRecord): string {
  const lines = [`Action Ledger task: ${task.metadata.id}`];
  if (task.metadata.project) lines.push(`Project: ${task.metadata.project}`);
  if (task.metadata.source_links.length > 0) {
    lines.push("");
    lines.push("Source links:");
    for (const link of task.metadata.source_links) lines.push(`- ${link}`);
  }
  return lines.join("\n");
}

export class AppleScriptReminderProvider implements ReminderProvider {
  async createReminder(input: ReminderProviderInput): Promise<string> {
    const stdout = await runAppleScript(APPLE_CREATE_SCRIPT, [
      input.list_name,
      input.title,
      input.due,
      input.notes
    ]);
    return stdout.trim();
  }

  async updateReminder(input: ReminderProviderInput & { apple_id: string }): Promise<string> {
    const stdout = await runAppleScript(APPLE_UPDATE_SCRIPT, [
      input.list_name,
      input.apple_id,
      input.title,
      input.due,
      input.notes
    ]);
    return stdout.trim();
  }

  async completeReminder(input: { apple_id: string; list_name: string }): Promise<void> {
    await runAppleScript(APPLE_COMPLETE_SCRIPT, [input.apple_id]);
  }
}

async function runAppleScript(script: string, args: string[]): Promise<string> {
  if (process.platform !== "darwin") {
    throw new CommandCenterError("Apple Reminders sync only runs on macOS.", "REMINDERS_MACOS_ONLY");
  }
  const { stdout } = await execFile("osascript", ["-e", script, ...args], {
    maxBuffer: 1024 * 1024
  });
  return stdout;
}

const APPLE_HELPERS = String.raw`
on ensureList(listName)
  tell application "Reminders"
    if not (exists list listName) then
      make new list with properties {name:listName}
    end if
    return list listName
  end tell
end ensureList

on dueDateFromIso(dateText)
  set AppleScript's text item delimiters to "-"
  set parts to text items of dateText
  set AppleScript's text item delimiters to ""
  set dueDate to current date
  set year of dueDate to (item 1 of parts as integer)
  set month of dueDate to (item 2 of parts as integer)
  set day of dueDate to (item 3 of parts as integer)
  set time of dueDate to 9 * hours
  return dueDate
end dueDateFromIso
`;

const APPLE_CREATE_SCRIPT = `${APPLE_HELPERS}
on run argv
  set listName to item 1 of argv
  set reminderTitle to item 2 of argv
  set dueText to item 3 of argv
  set noteText to item 4 of argv
  set dueDate to dueDateFromIso(dueText)
  tell application "Reminders"
    set theList to my ensureList(listName)
    set r to make new reminder at end of reminders of theList with properties {name:reminderTitle, body:noteText, due date:dueDate}
    return id of r
  end tell
end run`;

const APPLE_UPDATE_SCRIPT = `${APPLE_HELPERS}
on run argv
  set listName to item 1 of argv
  set reminderId to item 2 of argv
  set reminderTitle to item 3 of argv
  set dueText to item 4 of argv
  set noteText to item 5 of argv
  set dueDate to dueDateFromIso(dueText)
  tell application "Reminders"
    set theList to my ensureList(listName)
    try
      set r to reminder id reminderId
      set name of r to reminderTitle
      set body of r to noteText
      set due date of r to dueDate
      set completed of r to false
      return id of r
    on error
      set r to make new reminder at end of reminders of theList with properties {name:reminderTitle, body:noteText, due date:dueDate}
      return id of r
    end try
  end tell
end run`;

const APPLE_COMPLETE_SCRIPT = `${APPLE_HELPERS}
on run argv
  set reminderId to item 1 of argv
  tell application "Reminders"
    set r to reminder id reminderId
    set completed of r to true
  end tell
end run`;
