import type { Filters, TaskRecord, TaskStatus } from "./types";

export const STATUS_LANES: Array<{ id: TaskStatus; label: string; description: string }> = [
  { id: "inbox", label: "Inbox", description: "Unsorted captures" },
  { id: "next", label: "Next", description: "Ready to do" },
  { id: "doing", label: "Doing", description: "Active work" },
  { id: "waiting", label: "Waiting", description: "Blocked or waiting on someone" },
  { id: "done", label: "Done", description: "Completed work" }
];

export function taskMatchesFilters(task: TaskRecord, filters: Filters): boolean {
  if (filters.hideDone && task.status === "done") return false;
  if (filters.area && task.area !== filters.area) return false;
  if (filters.project && task.project !== filters.project) return false;
  if (filters.dueBefore && (!task.due || task.due > filters.dueBefore)) return false;

  const query = filters.search.trim().toLowerCase();
  if (!query) return true;

  const haystack = [
    task.title,
    task.area,
    task.project ?? "",
    task.priority,
    task.due ?? "",
    task.tags.join(" "),
    task.body
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

export function groupTasks(tasks: TaskRecord[], filters: Filters): Record<TaskStatus, TaskRecord[]> {
  const groups: Record<TaskStatus, TaskRecord[]> = {
    inbox: [],
    next: [],
    doing: [],
    waiting: [],
    done: []
  };
  for (const task of tasks) {
    if (!taskMatchesFilters(task, filters)) continue;
    groups[task.status].push(task);
  }
  for (const lane of STATUS_LANES) {
    groups[lane.id].sort(compareTasks);
  }
  return groups;
}

export function compareTasks(a: TaskRecord, b: TaskRecord): number {
  const dueA = a.due ?? "9999-99-99";
  const dueB = b.due ?? "9999-99-99";
  return dueA.localeCompare(dueB) || priorityRank(b.priority) - priorityRank(a.priority) || a.title.localeCompare(b.title);
}

export function priorityRank(priority: string): number {
  if (priority === "urgent") return 4;
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  if (priority === "low") return 1;
  return 0;
}

export function uniqueAreas(tasks: TaskRecord[]): string[] {
  return [...new Set(tasks.map((task) => task.area))].sort();
}

export function dueSoonCount(tasks: TaskRecord[], today = new Date()): number {
  const soon = new Date(today);
  soon.setDate(soon.getDate() + 7);
  const limit = soon.toISOString().slice(0, 10);
  return tasks.filter((task) => task.status !== "done" && task.due && task.due <= limit).length;
}
