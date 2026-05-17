export interface TaskLogEntry {
  raw: string;
  at?: string;
  author?: string;
  message: string;
}

export function extractSection(body: string, heading: string): string {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => line.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (start === -1) return "";

  const collected: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index] ?? "")) break;
    collected.push(lines[index] ?? "");
  }
  return collected.join("\n").trim();
}

export function taskDescription(body: string): string {
  const objective = extractSection(body, "Objective") || extractSection(body, "Objetivo");
  if (objective) return compactMarkdown(objective);

  const withoutLog = removeSection(body, "Log");
  return compactMarkdown(
    withoutLog
      .split("\n")
      .filter((line) => !line.trim().startsWith("## "))
      .join("\n")
  );
}

export function taskLogEntries(body: string): TaskLogEntry[] {
  const section = extractSection(body, "Log");
  if (!section) return [];
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => parseLogLine(line.slice(2).trim()));
}

function parseLogLine(raw: string): TaskLogEntry {
  const match = raw.match(/^([0-9T:.\-Z+]+)\s+-\s+([^:]+):\s+(.+)$/);
  if (!match) return { raw, message: raw };
  return {
    raw,
    at: match[1],
    author: match[2],
    message: match[3]
  };
}

function removeSection(body: string, heading: string): string {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => line.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (start === -1) return body;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s+/.test(lines[index] ?? "")) {
      end = index;
      break;
    }
  }
  return [...lines.slice(0, start), ...lines.slice(end)].join("\n");
}

function compactMarkdown(value: string): string {
  return value
    .replace(/^- \[[ x]\]\s+/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
