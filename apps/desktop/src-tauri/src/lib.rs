use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

const STATUSES: [&str; 5] = ["inbox", "next", "doing", "waiting", "done"];

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ReminderMeta {
    #[serde(default)]
    enabled: bool,
    #[serde(default)]
    apple_id: Option<String>,
}

impl Default for ReminderMeta {
    fn default() -> Self {
        Self {
            enabled: false,
            apple_id: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct TaskMeta {
    #[serde(default = "default_schema_version")]
    schema_version: u32,
    id: String,
    title: String,
    #[serde(default = "default_area")]
    area: String,
    #[serde(default)]
    project: Option<String>,
    #[serde(default = "default_status")]
    status: String,
    #[serde(default = "default_priority")]
    priority: String,
    #[serde(default)]
    due: Option<String>,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    reminder: ReminderMeta,
    #[serde(default)]
    source_links: Vec<String>,
    created_at: String,
    updated_at: String,
    #[serde(default)]
    completed_at: Option<String>,
    #[serde(default)]
    archived_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ProjectMeta {
    #[serde(default = "default_schema_version")]
    schema_version: u32,
    id: String,
    title: String,
    #[serde(default = "default_area")]
    area: String,
    #[serde(default)]
    status: String,
    #[serde(default = "default_priority")]
    priority: String,
    #[serde(default)]
    source_links: Vec<String>,
    created_at: String,
    updated_at: String,
    #[serde(default)]
    archived_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct TaskRecord {
    #[serde(flatten)]
    metadata: TaskMeta,
    body: String,
    path: String,
}

#[derive(Debug, Clone, Serialize)]
struct ProjectRecord {
    #[serde(flatten)]
    metadata: ProjectMeta,
    body: String,
    path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct WorkspaceConfig {
    data_dir: String,
}

#[derive(Debug, Clone, Serialize)]
struct WorkspaceStatus {
    data_dir: String,
    tasks: usize,
    projects: usize,
}

#[derive(Debug, Clone, Deserialize)]
struct TaskInput {
    title: String,
    #[serde(default)]
    area: Option<String>,
    #[serde(default)]
    project: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    priority: Option<String>,
    #[serde(default)]
    due: Option<String>,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    reminder_enabled: bool,
    #[serde(default)]
    source_links: Vec<String>,
    #[serde(default)]
    body: Option<String>,
}

fn default_schema_version() -> u32 {
    1
}

fn default_area() -> String {
    "other".to_string()
}

fn default_status() -> String {
    "inbox".to_string()
}

fn default_priority() -> String {
    "medium".to_string()
}

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn home_dir() -> Result<PathBuf, String> {
    dirs::home_dir().ok_or_else(|| "Could not resolve home directory".to_string())
}

fn default_data_dir() -> Result<PathBuf, String> {
    Ok(home_dir()?.join("Documents").join("Action Ledger"))
}

fn global_config_path() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(".action-ledger").join("config.yaml"))
}

fn legacy_global_config_path() -> Result<PathBuf, String> {
    Ok(home_dir()?.join(".agent-command-center").join("config.yaml"))
}

fn resolve_data_dir(data_dir: Option<String>) -> Result<PathBuf, String> {
    if let Some(path) = data_dir {
        if !path.trim().is_empty() {
            return Ok(expand_home(path));
        }
    }

    let mut config_path = global_config_path()?;
    if !config_path.exists() {
        let legacy_config_path = legacy_global_config_path()?;
        if legacy_config_path.exists() {
            config_path = legacy_config_path;
        }
    }
    if config_path.exists() {
        let raw = fs::read_to_string(&config_path)
            .map_err(|err| format!("Failed to read config {}: {err}", config_path.display()))?;
        if let Ok(config) = serde_yaml::from_str::<WorkspaceConfig>(&raw) {
            return Ok(expand_home(config.data_dir));
        }
    }

    default_data_dir()
}

fn expand_home(value: String) -> PathBuf {
    if value == "~" {
        return dirs::home_dir().unwrap_or_else(|| PathBuf::from(value));
    }
    if let Some(rest) = value.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest);
        }
    }
    PathBuf::from(value)
}

fn task_lane_dir(data_dir: &Path, status: &str) -> PathBuf {
    data_dir.join("tasks").join(status)
}

fn task_path(data_dir: &Path, status: &str, id: &str) -> PathBuf {
    task_lane_dir(data_dir, status).join(format!("{id}.md"))
}

fn archived_task_path(data_dir: &Path, id: &str) -> PathBuf {
    data_dir.join("archive").join("tasks").join(format!("{id}.md"))
}

fn projects_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("projects")
}

fn split_frontmatter(raw: &str, file: &Path) -> Result<(String, String), String> {
    let without_start = raw
        .strip_prefix("---")
        .ok_or_else(|| format!("Missing frontmatter start in {}", file.display()))?;
    let without_start = without_start.strip_prefix('\n').unwrap_or(without_start);
    let end = without_start
        .find("\n---")
        .ok_or_else(|| format!("Missing frontmatter end in {}", file.display()))?;
    let yaml = without_start[..end].to_string();
    let body_start = end + "\n---".len();
    let body = without_start[body_start..]
        .strip_prefix('\n')
        .unwrap_or(&without_start[body_start..])
        .to_string();
    Ok((yaml, body))
}

fn read_task(file: &Path) -> Result<TaskRecord, String> {
    let raw = fs::read_to_string(file).map_err(|err| format!("Failed to read {}: {err}", file.display()))?;
    let (yaml, body) = split_frontmatter(&raw, file)?;
    let metadata: TaskMeta =
        serde_yaml::from_str(&yaml).map_err(|err| format!("Malformed task frontmatter {}: {err}", file.display()))?;
    Ok(TaskRecord {
        metadata,
        body,
        path: file.to_string_lossy().to_string(),
    })
}

fn read_project(file: &Path) -> Result<ProjectRecord, String> {
    let raw = fs::read_to_string(file).map_err(|err| format!("Failed to read {}: {err}", file.display()))?;
    let (yaml, body) = split_frontmatter(&raw, file)?;
    let metadata: ProjectMeta =
        serde_yaml::from_str(&yaml).map_err(|err| format!("Malformed project frontmatter {}: {err}", file.display()))?;
    Ok(ProjectRecord {
        metadata,
        body,
        path: file.to_string_lossy().to_string(),
    })
}

fn write_task(file: &Path, task: &TaskRecord) -> Result<(), String> {
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("Failed to create {}: {err}", parent.display()))?;
    }
    let yaml = serde_yaml::to_string(&task.metadata).map_err(|err| format!("Failed to serialize task: {err}"))?;
    fs::write(file, format!("---\n{}---\n{}", yaml, task.body))
        .map_err(|err| format!("Failed to write {}: {err}", file.display()))
}

fn find_task_path(data_dir: &Path, id: &str) -> Result<PathBuf, String> {
    for status in STATUSES {
        let candidate = task_path(data_dir, status, id);
        if candidate.exists() {
            return Ok(candidate);
        }
    }
    let archived = archived_task_path(data_dir, id);
    if archived.exists() {
        return Ok(archived);
    }
    Err(format!("Task not found: {id}"))
}

fn validate_status(status: &str) -> Result<(), String> {
    if STATUSES.contains(&status) {
        Ok(())
    } else {
        Err(format!("Invalid status: {status}"))
    }
}

fn slugify(value: &str) -> String {
    let mut out = String::new();
    let mut last_dash = false;
    for ch in value.chars().flat_map(|ch| ch.to_lowercase()) {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
            last_dash = false;
        } else if !last_dash {
            out.push('-');
            last_dash = true;
        }
    }
    let trimmed = out.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "task".to_string()
    } else {
        trimmed
    }
}

fn list_tasks_internal(
    data_dir: &Path,
    status: Option<String>,
    area: Option<String>,
    project: Option<String>,
    due_before: Option<String>,
) -> Result<Vec<TaskRecord>, String> {
    let lanes: Vec<String> = match status {
        Some(status) => {
            validate_status(&status)?;
            vec![status]
        }
        None => STATUSES.iter().map(|status| status.to_string()).collect(),
    };

    let mut tasks = Vec::new();
    for lane in lanes {
        let dir = task_lane_dir(data_dir, &lane);
        if !dir.exists() {
            continue;
        }
        for entry in fs::read_dir(&dir).map_err(|err| format!("Failed to read {}: {err}", dir.display()))? {
            let entry = entry.map_err(|err| format!("Failed to read directory entry: {err}"))?;
            let path = entry.path();
            if path.extension().and_then(|ext| ext.to_str()) != Some("md") {
                continue;
            }
            let task = read_task(&path)?;
            if let Some(area) = &area {
                if &task.metadata.area != area {
                    continue;
                }
            }
            if let Some(project) = &project {
                if task.metadata.project.as_deref() != Some(project.as_str()) {
                    continue;
                }
            }
            if let Some(due_before) = &due_before {
                match task.metadata.due.as_deref() {
                    Some(due) if due <= due_before.as_str() => {}
                    _ => continue,
                }
            }
            tasks.push(task);
        }
    }

    tasks.sort_by(|a, b| {
        let due_a = a.metadata.due.as_deref().unwrap_or("9999-99-99");
        let due_b = b.metadata.due.as_deref().unwrap_or("9999-99-99");
        due_a
            .cmp(due_b)
            .then_with(|| a.metadata.created_at.cmp(&b.metadata.created_at))
    });
    Ok(tasks)
}

#[tauri::command]
fn get_workspace_status(data_dir: Option<String>) -> Result<WorkspaceStatus, String> {
    let data_dir = resolve_data_dir(data_dir)?;
    let tasks = list_tasks_internal(&data_dir, None, None, None, None)?.len();
    let projects = list_projects(Some(data_dir.to_string_lossy().to_string()))?.len();
    Ok(WorkspaceStatus {
        data_dir: data_dir.to_string_lossy().to_string(),
        tasks,
        projects,
    })
}

#[tauri::command]
fn list_tasks(
    data_dir: Option<String>,
    status: Option<String>,
    area: Option<String>,
    project: Option<String>,
    due_before: Option<String>,
) -> Result<Vec<TaskRecord>, String> {
    let data_dir = resolve_data_dir(data_dir)?;
    list_tasks_internal(&data_dir, status, area, project, due_before)
}

#[tauri::command]
fn list_projects(data_dir: Option<String>) -> Result<Vec<ProjectRecord>, String> {
    let data_dir = resolve_data_dir(data_dir)?;
    let dir = projects_dir(&data_dir);
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut projects = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|err| format!("Failed to read {}: {err}", dir.display()))? {
        let entry = entry.map_err(|err| format!("Failed to read directory entry: {err}"))?;
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) == Some("md") {
            projects.push(read_project(&path)?);
        }
    }
    projects.sort_by(|a, b| a.metadata.title.cmp(&b.metadata.title));
    Ok(projects)
}

#[tauri::command]
fn create_task(data_dir: Option<String>, input: TaskInput) -> Result<TaskRecord, String> {
    let data_dir = resolve_data_dir(data_dir)?;
    let status = input.status.unwrap_or_else(default_status);
    validate_status(&status)?;
    let now = now_iso();
    let id = format!(
        "task_{}_{}",
        Utc::now().format("%Y%m%d%H%M%S"),
        slugify(&input.title)
    );
    let metadata = TaskMeta {
        schema_version: 1,
        id: id.clone(),
        title: input.title,
        area: input.area.unwrap_or_else(default_area),
        project: input.project,
        status: status.clone(),
        priority: input.priority.unwrap_or_else(default_priority),
        due: input.due,
        tags: input.tags,
        reminder: ReminderMeta {
            enabled: input.reminder_enabled,
            apple_id: None,
        },
        source_links: input.source_links,
        created_at: now.clone(),
        updated_at: now,
        completed_at: None,
        archived_at: None,
    };
    let file = task_path(&data_dir, &status, &id);
    let task = TaskRecord {
        metadata,
        body: input.body.unwrap_or_else(|| "\n".to_string()),
        path: file.to_string_lossy().to_string(),
    };
    write_task(&file, &task)?;
    read_task(&file)
}

#[tauri::command]
fn move_task(data_dir: Option<String>, id: String, status: String) -> Result<TaskRecord, String> {
    validate_status(&status)?;
    let data_dir = resolve_data_dir(data_dir)?;
    let current_path = find_task_path(&data_dir, &id)?;
    let mut task = read_task(&current_path)?;
    task.metadata.status = status.clone();
    task.metadata.updated_at = now_iso();
    task.metadata.archived_at = None;
    if status == "done" && task.metadata.completed_at.is_none() {
        task.metadata.completed_at = Some(now_iso());
    }

    write_task(&current_path, &task)?;
    let next_path = task_path(&data_dir, &status, &id);
    if current_path != next_path {
        if next_path.exists() {
            return Err(format!("Target task path already exists: {}", next_path.display()));
        }
        if let Some(parent) = next_path.parent() {
            fs::create_dir_all(parent).map_err(|err| format!("Failed to create {}: {err}", parent.display()))?;
        }
        fs::rename(&current_path, &next_path)
            .map_err(|err| format!("Failed to move task to {}: {err}", next_path.display()))?;
    }
    read_task(&next_path)
}

#[tauri::command]
fn complete_task(data_dir: Option<String>, id: String) -> Result<TaskRecord, String> {
    move_task(data_dir, id, "done".to_string())
}

#[tauri::command]
fn archive_task(data_dir: Option<String>, id: String) -> Result<TaskRecord, String> {
    let data_dir = resolve_data_dir(data_dir)?;
    let current_path = find_task_path(&data_dir, &id)?;
    let mut task = read_task(&current_path)?;
    task.metadata.archived_at = Some(now_iso());
    task.metadata.updated_at = now_iso();
    write_task(&current_path, &task)?;
    let next_path = archived_task_path(&data_dir, &id);
    if next_path.exists() {
        return Err(format!("Target archive path already exists: {}", next_path.display()));
    }
    if let Some(parent) = next_path.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("Failed to create {}: {err}", parent.display()))?;
    }
    fs::rename(&current_path, &next_path)
        .map_err(|err| format!("Failed to archive task to {}: {err}", next_path.display()))?;
    read_task(&next_path)
}

#[tauri::command]
fn delete_task(data_dir: Option<String>, id: String, confirm: bool) -> Result<String, String> {
    if !confirm {
        return Err("delete_task requires confirm=true".to_string());
    }
    let data_dir = resolve_data_dir(data_dir)?;
    let target = find_task_path(&data_dir, &id)?;
    fs::remove_file(&target).map_err(|err| format!("Failed to delete {}: {err}", target.display()))?;
    Ok(id)
}

#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    Command::new("open")
        .arg(path)
        .status()
        .map_err(|err| format!("Failed to run open: {err}"))
        .and_then(|status| {
            if status.success() {
                Ok(())
            } else {
                Err(format!("open exited with status {status}"))
            }
        })
}

#[tauri::command]
fn open_data_dir(data_dir: Option<String>) -> Result<(), String> {
    open_path(resolve_data_dir(data_dir)?.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            archive_task,
            complete_task,
            create_task,
            delete_task,
            get_workspace_status,
            list_projects,
            list_tasks,
            move_task,
            open_data_dir,
            open_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static TEMP_COUNTER: AtomicUsize = AtomicUsize::new(0);

    fn temp_workspace() -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time should be available")
            .as_nanos();
        let counter = TEMP_COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!(
            "acc-desktop-test-{}-{suffix}-{counter}",
            std::process::id()
        ));
        for status in STATUSES {
            fs::create_dir_all(task_lane_dir(&dir, status)).expect("lane should be created");
        }
        fs::create_dir_all(projects_dir(&dir)).expect("projects dir should be created");
        fs::create_dir_all(dir.join("archive").join("tasks")).expect("archive dir should be created");
        dir
    }

    fn sample_task(id: &str, status: &str, due: Option<&str>) -> TaskRecord {
        TaskRecord {
            metadata: TaskMeta {
                schema_version: 1,
                id: id.to_string(),
                title: id.to_string(),
                area: "learning".to_string(),
                project: Some("project_demo".to_string()),
                status: status.to_string(),
                priority: "medium".to_string(),
                due: due.map(str::to_string),
                tags: vec![],
                reminder: ReminderMeta::default(),
                source_links: vec!["/example/source.md".to_string()],
                created_at: "2026-05-17T00:00:00.000Z".to_string(),
                updated_at: "2026-05-17T00:00:00.000Z".to_string(),
                completed_at: None,
                archived_at: None,
            },
            body: "## Objective\n\nTest task.\n".to_string(),
            path: String::new(),
        }
    }

    #[test]
    fn lists_tasks_with_due_before_filter() {
        let dir = temp_workspace();
        let soon = sample_task("task_soon", "next", Some("2026-05-24"));
        let later = sample_task("task_later", "next", Some("2026-06-24"));
        let undated = sample_task("task_undated", "next", None);
        write_task(&task_path(&dir, "next", "task_soon"), &soon).expect("soon task should write");
        write_task(&task_path(&dir, "next", "task_later"), &later).expect("later task should write");
        write_task(&task_path(&dir, "next", "task_undated"), &undated).expect("undated task should write");

        let tasks = list_tasks_internal(&dir, None, None, None, Some("2026-05-31".to_string()))
            .expect("tasks should list");
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].metadata.id, "task_soon");

        fs::remove_dir_all(dir).expect("temp workspace should be removed");
    }

    #[test]
    fn move_and_archive_preserve_body_and_links() {
        let dir = temp_workspace();
        let task = sample_task("task_move", "next", Some("2026-05-24"));
        write_task(&task_path(&dir, "next", "task_move"), &task).expect("task should write");

        let moved = move_task(
            Some(dir.to_string_lossy().to_string()),
            "task_move".to_string(),
            "doing".to_string(),
        )
        .expect("task should move");
        assert_eq!(moved.metadata.status, "doing");
        assert!(moved.body.contains("Test task"));
        assert!(!task_path(&dir, "next", "task_move").exists());
        assert!(task_path(&dir, "doing", "task_move").exists());

        let archived = archive_task(Some(dir.to_string_lossy().to_string()), "task_move".to_string())
            .expect("task should archive");
        assert!(archived.path.contains("archive/tasks"));
        assert_eq!(archived.metadata.source_links, vec!["/example/source.md"]);

        fs::remove_dir_all(dir).expect("temp workspace should be removed");
    }
}
