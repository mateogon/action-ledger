# Workspace Format

Default workspace:

```text
~/Documents/Action Ledger/
  config.yaml
  tasks/
    inbox/
    next/
    doing/
    waiting/
    done/
  projects/
  archive/
    tasks/
    projects/
  templates/
```

## Task Statuses

- `inbox`
- `next`
- `doing`
- `waiting`
- `done`

## Areas

- `work`
- `learning`
- `personal`
- `media`
- `admin`
- `extra`
- `other`

## Task File

Each task is a Markdown file under `tasks/<status>/<id>.md`.

```md
---
schema_version: 1
id: task_20260517090000_study-docs
title: Study docs
area: learning
project: communication-systems
status: next
priority: high
due: 2026-05-24
tags:
  - study
reminder:
  enabled: true
  apple_id: null
claim: null
source_links:
  - /path/to/source.md
created_at: 2026-05-17T09:00:00.000Z
updated_at: 2026-05-17T09:00:00.000Z
completed_at: null
archived_at: null
---

## Objective

Do the thing.
```

`claim` is optional and backward-compatible. Older task files without this field parse as `claim: null`.

When a task is claimed by an agent or session, it looks like this:

```yaml
claim:
  owner: Codex
  at: 2026-05-17T09:30:00.000Z
```

Claims are lightweight coordination metadata. They help multiple agents or parallel sessions avoid ambiguous ownership, but they are not a distributed lock. Completing a task clears the claim automatically.

## Project File

Each project is a Markdown file under `projects/<id>.md`.

```md
---
schema_version: 1
id: project_20260517090000_communication-systems
title: Communication Systems
area: learning
status: active
priority: high
source_links: []
created_at: 2026-05-17T09:00:00.000Z
updated_at: 2026-05-17T09:00:00.000Z
archived_at: null
---

## Purpose

Practice communicating complex systems.
```
