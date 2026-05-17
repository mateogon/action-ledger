# MCP Tools

The MCP server exposes the same operations as the CLI and calls `packages/core` directly.

## Agent Policy

Action Ledger is for durable follow-up work, not every note or document.

Agents should suggest an Action Ledger task when a session produces a consolidated study, study plan, research project, curated watch/read list, or artifact worth revisiting with a clear next step.

Agents should not create tasks automatically unless the user explicitly asks to create, register, track, remind, or schedule it. When suggesting a task, include title, area, suggested status, due date if obvious, and source link.

Use `append_task_log` to record meaningful progress, decisions, feedback, or changed context on an existing task.

## Tools

- `init_workspace`
- `get_workspace_status`
- `create_task`
- `list_tasks`
- `get_task`
- `move_task`
- `complete_task`
- `archive_task`
- `delete_task`
- `create_project`
- `list_projects`
- `get_project`
- `link_source`
- `append_task_log`
- `sync_reminders`

`list_tasks` accepts `status`, `area`, `project`, and `due_before` filters. `due_before` returns only tasks with a due date on or before the given `YYYY-MM-DD` value.

## Resources

- `action-ledger://config`
- `action-ledger://tasks`
- `action-ledger://projects`
- `action-ledger://task/{id}`
- `action-ledger://project/{id}`

## Prompts

- `capture_project_plan`
- `create_study_followup`
- `weekly_review`

## Example Agent Flow

```text
create_task({
  title: "Week 1 - executive memo",
  area: "learning",
  status: "next",
  due: "2026-05-24",
  reminder_enabled: true,
  source_links: ["/path/to/study-plan.md"]
})

sync_reminders({ dry_run: true })
```

## Destructive Operations

`delete_task` requires:

```json
{ "confirm": true }
```

This is intentional so an agent cannot delete tasks by accident.

## Task Logs

Agents should use `append_task_log` to leave a useful trail inside a task Markdown file.

Example:

```json
{
  "id": "task_123",
  "message": "Compared the plan against the current repo and found the next action.",
  "author": "Codex"
}
```

The entry is written under `## Log` in the task body. Newest entries are inserted first.
