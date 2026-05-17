import {
  Archive,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  FolderOpen,
  Maximize2,
  MessageSquare,
  Minimize2,
  Plus,
  RefreshCw,
  Search,
  Trash2
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  archiveTask,
  completeTask,
  createTask,
  deleteTask,
  getWorkspaceStatus,
  listProjects,
  listTasks,
  moveTask,
  openDataDir,
  openPath
} from "./api";
import { dueSoonCount, groupTasks, STATUS_LANES, uniqueAreas } from "./board";
import { taskDescription, taskLogEntries } from "./taskContent";
import type { Filters, ProjectRecord, TaskArea, TaskPriority, TaskRecord, TaskStatus, WorkspaceStatus } from "./types";

const initialFilters: Filters = {
  area: "",
  project: "",
  search: "",
  dueBefore: "",
  hideDone: false
};

const areaOptions: TaskArea[] = ["work", "learning", "personal", "media", "admin", "extra", "other"];
const priorityOptions: TaskPriority[] = ["low", "medium", "high", "urgent"];

interface DraftTask {
  title: string;
  area: TaskArea;
  project: string;
  status: TaskStatus;
  priority: TaskPriority;
  due: string;
  reminder: boolean;
  body: string;
}

const initialDraft: DraftTask = {
  title: "",
  area: "learning",
  project: "",
  status: "next",
  priority: "medium",
  due: "",
  reminder: false,
  body: ""
};

const initialCollapsedLanes: Record<TaskStatus, boolean> = {
  inbox: false,
  next: false,
  doing: false,
  waiting: false,
  done: true
};

export function App() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [status, setStatus] = useState<WorkspaceStatus | null>(null);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [draft, setDraft] = useState<DraftTask>(initialDraft);
  const [collapsedLanes, setCollapsedLanes] = useState<Record<TaskStatus, boolean>>(initialCollapsedLanes);
  const [focusedLane, setFocusedLane] = useState<TaskStatus | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const refresh = async () => {
    setBusy(true);
    setError(null);
    try {
      const [workspaceStatus, nextTasks, nextProjects] = await Promise.all([
        getWorkspaceStatus(),
        listTasks(),
        listProjects()
      ]);
      setStatus(workspaceStatus);
      setTasks(nextTasks);
      setProjects(nextProjects);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const filteredGroups = useMemo(() => groupTasks(tasks, filters), [tasks, filters]);
  const areas = useMemo(() => uniqueAreas(tasks), [tasks]);
  const openTasks = tasks.filter((task) => task.status !== "done").length;
  const soon = dueSoonCount(tasks);
  const visibleLanes = focusedLane ? STATUS_LANES.filter((lane) => lane.id === focusedLane) : STATUS_LANES;
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;

  async function runAction(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  function onDrop(status: TaskStatus) {
    if (!draggedTaskId) return;
    const task = tasks.find((task) => task.id === draggedTaskId);
    setDraggedTaskId(null);
    if (!task || task.status === status) return;
    void runAction(() => moveTask(task.id, status));
  }

  async function onCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim()) return;
    await runAction(() =>
      createTask({
        title: draft.title.trim(),
        area: draft.area,
        project: draft.project || null,
        status: draft.status,
        priority: draft.priority,
        due: draft.due || null,
        reminder_enabled: draft.reminder,
        body: draft.body ? `## Objective\n\n${draft.body.trim()}\n` : "\n"
      })
    );
    setDraft(initialDraft);
    setShowNewTask(false);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Local workspace</p>
          <h1>Action Ledger</h1>
          <button className="path-button" type="button" onClick={() => void openDataDir()} title="Open data folder">
            <FolderOpen size={15} />
            <span>{status?.data_dir ?? "Loading workspace"}</span>
          </button>
        </div>
        <div className="topbar-actions">
          <button className="primary-action" type="button" onClick={() => setShowNewTask(true)}>
            <Plus size={17} />
            <span>New Task</span>
          </button>
          <button className="icon-action" type="button" onClick={() => void refresh()} disabled={busy} title="Refresh board">
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      <section className="metrics-strip" aria-label="Workspace metrics">
        <Metric label="Open" value={openTasks} />
        <Metric label="Due Soon" value={soon} />
        <Metric label="Projects" value={projects.length} />
        <Metric label="All Tasks" value={tasks.length} />
      </section>

      <section className="toolbar" aria-label="Board filters">
        <label className="search-field">
          <Search size={16} />
          <input
            value={filters.search}
            placeholder="Search tasks"
            onChange={(event) => setFilters({ ...filters, search: event.target.value })}
          />
        </label>
        <select value={filters.area} onChange={(event) => setFilters({ ...filters, area: event.target.value })}>
          <option value="">All areas</option>
          {areas.map((area) => (
            <option key={area} value={area}>
              {area}
            </option>
          ))}
        </select>
        <select value={filters.project} onChange={(event) => setFilters({ ...filters, project: event.target.value })}>
          <option value="">All projects</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.title}
            </option>
          ))}
        </select>
        <label className="date-field">
          <CalendarDays size={16} />
          <input
            type="text"
            value={filters.dueBefore}
            placeholder="Due <= YYYY-MM-DD"
            onChange={(event) => setFilters({ ...filters, dueBefore: event.target.value })}
          />
        </label>
        <label className="toggle-field">
          <input
            type="checkbox"
            checked={filters.hideDone}
            onChange={(event) => setFilters({ ...filters, hideDone: event.target.checked })}
          />
          <span>Hide done</span>
        </label>
      </section>

      {error ? <div className="error-banner">{error}</div> : null}

      <section className={`board ${focusedLane ? "board-focused" : ""}`} aria-label="Kanban board">
        {visibleLanes.map((lane) => {
          const collapsed = collapsedLanes[lane.id];
          return (
          <div
            className={`lane ${collapsed ? "lane-collapsed" : ""} ${draggedTaskId ? "lane-drop-ready" : ""}`}
            key={lane.id}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => onDrop(lane.id)}
          >
            <div className="lane-header">
              <button
                className="lane-title-button"
                type="button"
                onClick={() => setCollapsedLanes({ ...collapsedLanes, [lane.id]: !collapsed })}
                title={collapsed ? "Expand lane" : "Collapse lane"}
              >
                {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                <span>
                  <strong>{lane.label}</strong>
                  <small>{lane.description}</small>
                </span>
              </button>
              <div className="lane-header-actions">
                <span>{filteredGroups[lane.id].length}</span>
                <button
                  type="button"
                  onClick={() => setFocusedLane(focusedLane === lane.id ? null : lane.id)}
                  title={focusedLane === lane.id ? "Show all lanes" : "Focus lane"}
                >
                  {focusedLane === lane.id ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                </button>
              </div>
            </div>
            {collapsed ? (
              <button
                className="lane-collapsed-body"
                type="button"
                onClick={() => setCollapsedLanes({ ...collapsedLanes, [lane.id]: false })}
              >
                {filteredGroups[lane.id].length} tasks hidden
              </button>
            ) : (
              <div className="lane-list">
                {filteredGroups[lane.id].map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    project={projects.find((project) => project.id === task.project)}
                    onSelect={() => setSelectedTaskId(task.id)}
                    onDragStart={() => setDraggedTaskId(task.id)}
                    onDragEnd={() => setDraggedTaskId(null)}
                    onMove={(status) => void runAction(() => moveTask(task.id, status))}
                    onComplete={() => void runAction(() => completeTask(task.id))}
                    onArchive={() => void runAction(() => archiveTask(task.id))}
                    onDelete={() => {
                      if (window.confirm(`Delete "${task.title}"?`)) {
                        void runAction(() => deleteTask(task.id));
                      }
                    }}
                  />
                ))}
                {filteredGroups[lane.id].length === 0 ? <div className="empty-lane">No tasks</div> : null}
              </div>
            )}
          </div>
          );
        })}
      </section>

      {showNewTask ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowNewTask(false)}>
          <form className="task-modal" onSubmit={(event) => void onCreateTask(event)} onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>New Task</h2>
              <button type="button" onClick={() => setShowNewTask(false)}>
                Cancel
              </button>
            </div>
            <label>
              <span>Title</span>
              <input
                autoFocus
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                placeholder="Write memo, review project, watch saved film"
              />
            </label>
            <div className="form-grid">
              <label>
                <span>Area</span>
                <select value={draft.area} onChange={(event) => setDraft({ ...draft, area: event.target.value as TaskArea })}>
                  {areaOptions.map((area) => (
                    <option key={area} value={area}>
                      {area}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Project</span>
                <select value={draft.project} onChange={(event) => setDraft({ ...draft, project: event.target.value })}>
                  <option value="">No project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Status</span>
                <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as TaskStatus })}>
                  {STATUS_LANES.map((lane) => (
                    <option key={lane.id} value={lane.id}>
                      {lane.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Priority</span>
                <select
                  value={draft.priority}
                  onChange={(event) => setDraft({ ...draft, priority: event.target.value as TaskPriority })}
                >
                  {priorityOptions.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Due</span>
                <input type="date" value={draft.due} onChange={(event) => setDraft({ ...draft, due: event.target.value })} />
              </label>
              <label className="modal-toggle">
                <input
                  type="checkbox"
                  checked={draft.reminder}
                  onChange={(event) => setDraft({ ...draft, reminder: event.target.checked })}
                />
                <span>Mirror to Reminders on next sync</span>
              </label>
            </div>
            <label>
              <span>Objective</span>
              <textarea
                value={draft.body}
                onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                placeholder="Concrete expected outcome"
              />
            </label>
            <button className="primary-action submit-action" type="submit" disabled={!draft.title.trim()}>
              <Plus size={17} />
              <span>Create Task</span>
            </button>
          </form>
        </div>
      ) : null}

      {selectedTask ? (
        <TaskDetailModal
          task={selectedTask}
          project={projects.find((project) => project.id === selectedTask.project)}
          onClose={() => setSelectedTaskId(null)}
          onMove={(status) => void runAction(() => moveTask(selectedTask.id, status))}
          onComplete={() => void runAction(() => completeTask(selectedTask.id))}
          onArchive={() => void runAction(() => archiveTask(selectedTask.id))}
        />
      ) : null}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TaskCard({
  task,
  project,
  onDragStart,
  onDragEnd,
  onMove,
  onComplete,
  onArchive,
  onDelete,
  onSelect
}: {
  task: TaskRecord;
  project?: ProjectRecord;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (status: TaskStatus) => void;
  onComplete: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onSelect: () => void;
}) {
  const description = taskDescription(task.body);
  const logs = taskLogEntries(task.body);
  const latestLog = logs[0];

  return (
    <article className={`task-card priority-${task.priority}`} draggable onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="task-card-topline">
        <span className="area-pill">{task.area}</span>
        <span className="priority-pill">{task.priority}</span>
      </div>
      <h3>{task.title}</h3>
      {project ? <p className="project-line">{project.title}</p> : null}
      {description ? <p className="task-description">{description}</p> : null}
      <div className="task-meta">
        {task.due ? (
          <span>
            <CalendarDays size={14} />
            {task.due}
          </span>
        ) : null}
        {task.reminder.enabled ? (
          <span>
            <Bell size={14} />
            Reminder
          </span>
        ) : null}
      </div>
      {task.tags.length ? (
        <div className="tag-list">
          {task.tags.slice(0, 3).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      ) : null}
      {latestLog ? (
        <button className="latest-log" type="button" onClick={onSelect}>
          <MessageSquare size={14} />
          <span>{latestLog.message}</span>
        </button>
      ) : null}
      <div className="card-actions">
        <select value={task.status} onChange={(event) => onMove(event.target.value as TaskStatus)} title="Move task">
          {STATUS_LANES.map((lane) => (
            <option key={lane.id} value={lane.id}>
              {lane.label}
            </option>
          ))}
        </select>
        <button type="button" onClick={onComplete} title="Mark done" disabled={task.status === "done"}>
          <CheckCircle2 size={16} />
        </button>
        <button type="button" onClick={onArchive} title="Archive">
          <Archive size={16} />
        </button>
        <button type="button" onClick={() => void openPath(task.path)} title="Open task file">
          <ExternalLink size={16} />
        </button>
        <button type="button" onClick={onSelect} title="View details">
          <FileText size={16} />
        </button>
        <button className="danger-action" type="button" onClick={onDelete} title="Delete">
          <Trash2 size={16} />
        </button>
      </div>
      {task.source_links.length ? (
        <div className="source-links">
          {task.source_links.slice(0, 2).map((link) => (
            <button key={link} type="button" onClick={() => void openPath(link)} title={link}>
              <ExternalLink size={13} />
              <span>{compactPath(link)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function TaskDetailModal({
  task,
  project,
  onClose,
  onMove,
  onComplete,
  onArchive
}: {
  task: TaskRecord;
  project?: ProjectRecord;
  onClose: () => void;
  onMove: (status: TaskStatus) => void;
  onComplete: () => void;
  onArchive: () => void;
}) {
  const description = taskDescription(task.body);
  const logs = taskLogEntries(task.body);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="task-detail-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">{task.area}</p>
            <h2>{task.title}</h2>
          </div>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="detail-meta-grid">
          <DetailItem label="Status" value={task.status} />
          <DetailItem label="Priority" value={task.priority} />
          <DetailItem label="Due" value={task.due ?? "No due date"} />
          <DetailItem label="Project" value={project?.title ?? "No project"} />
        </div>

        <div className="detail-actions">
          <select value={task.status} onChange={(event) => onMove(event.target.value as TaskStatus)}>
            {STATUS_LANES.map((lane) => (
              <option key={lane.id} value={lane.id}>
                {lane.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={onComplete} disabled={task.status === "done"}>
            <CheckCircle2 size={16} />
            Done
          </button>
          <button type="button" onClick={onArchive}>
            <Archive size={16} />
            Archive
          </button>
          <button type="button" onClick={() => void openPath(task.path)}>
            <ExternalLink size={16} />
            Open File
          </button>
        </div>

        <section className="detail-section">
          <h3>Description</h3>
          <p>{description || "No description yet."}</p>
        </section>

        <section className="detail-section">
          <h3>Task Log</h3>
          {logs.length ? (
            <div className="log-list">
              {logs.map((entry) => (
                <div className="log-entry" key={entry.raw}>
                  <span>{entry.at ? formatLogDate(entry.at) : "Log"}</span>
                  <p>
                    {entry.author ? <strong>{entry.author}: </strong> : null}
                    {entry.message}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p>No log entries yet.</p>
          )}
        </section>

        {task.source_links.length ? (
          <section className="detail-section">
            <h3>Sources</h3>
            <div className="detail-source-list">
              {task.source_links.map((link) => (
                <button key={link} type="button" onClick={() => void openPath(link)} title={link}>
                  <ExternalLink size={14} />
                  {link}
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatLogDate(value: string): string {
  return value.replace("T", " ").replace(".000Z", "");
}

function compactPath(path: string): string {
  const parts = path.split("/");
  if (parts.length <= 2) return path;
  return parts.slice(-2).join("/");
}
