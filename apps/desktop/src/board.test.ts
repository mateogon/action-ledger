import { describe, expect, it } from "vitest";
import { dueSoonCount, groupTasks, taskMatchesFilters } from "./board";
import { taskDescription, taskLogEntries } from "./taskContent";
import type { Filters, TaskRecord } from "./types";

const baseTask: TaskRecord = {
  schema_version: 1,
  id: "task_base",
  title: "Base",
  area: "learning",
  project: "project_demo",
  status: "next",
  priority: "medium",
  due: null,
  tags: [],
  reminder: { enabled: false, apple_id: null },
  source_links: [],
  created_at: "2026-05-17T00:00:00.000Z",
  updated_at: "2026-05-17T00:00:00.000Z",
  completed_at: null,
  archived_at: null,
  body: "",
  path: "/example/task.md"
};

const filters: Filters = {
  area: "",
  project: "",
  search: "",
  dueBefore: "",
  hideDone: false
};

describe("board helpers", () => {
  it("groups matching tasks by status", () => {
    const groups = groupTasks(
      [
        { ...baseTask, id: "a", title: "Next task", status: "next" },
        { ...baseTask, id: "b", title: "Doing task", status: "doing" }
      ],
      filters
    );
    expect(groups.next.map((task) => task.id)).toEqual(["a"]);
    expect(groups.doing.map((task) => task.id)).toEqual(["b"]);
  });

  it("filters by area, project, search, due date, and done visibility", () => {
    expect(taskMatchesFilters(baseTask, { ...filters, area: "work" })).toBe(false);
    expect(taskMatchesFilters(baseTask, { ...filters, project: "other" })).toBe(false);
    expect(taskMatchesFilters({ ...baseTask, body: "diagram flow" }, { ...filters, search: "flow" })).toBe(true);
    expect(taskMatchesFilters({ ...baseTask, due: "2026-06-01" }, { ...filters, dueBefore: "2026-05-31" })).toBe(false);
    expect(taskMatchesFilters({ ...baseTask, status: "done" }, { ...filters, hideDone: true })).toBe(false);
  });

  it("counts open tasks due in the next seven days", () => {
    const today = new Date("2026-05-17T12:00:00.000Z");
    expect(
      dueSoonCount(
        [
          { ...baseTask, id: "soon", due: "2026-05-20" },
          { ...baseTask, id: "later", due: "2026-06-20" },
          { ...baseTask, id: "done", status: "done", due: "2026-05-20" }
        ],
        today
      )
    ).toBe(1);
  });

  it("extracts task description and newest log entries from Markdown body", () => {
    const body = [
      "## Objective",
      "",
      "Write a memo about the system.",
      "",
      "## Log",
      "",
      "- 2026-05-17T11:00:00.000Z - Codex: Added task detail modal",
      "- 2026-05-17T10:00:00.000Z - Mateo: Asked for task logs"
    ].join("\n");

    expect(taskDescription(body)).toBe("Write a memo about the system.");
    expect(taskLogEntries(body).map((entry) => entry.message)).toEqual([
      "Added task detail modal",
      "Asked for task logs"
    ]);
    expect(taskDescription("## Objetivo\n\nEscribir un memo ejecutivo.\n")).toBe("Escribir un memo ejecutivo.");
  });
});
