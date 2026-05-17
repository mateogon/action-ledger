import { readFile, writeFile } from "node:fs/promises";
import matter from "gray-matter";
import YAML from "yaml";

export interface MarkdownDoc<T> {
  data: T;
  body: string;
}

export async function readMarkdown<T>(filePath: string): Promise<MarkdownDoc<T>> {
  const raw = await readFile(filePath, "utf8");
  const parsed = matter(raw, {
    engines: {
      yaml: (source) => YAML.parse(source) as object
    }
  });
  return {
    data: parsed.data as T,
    body: parsed.content.trimStart()
  };
}

export async function writeMarkdown<T extends Record<string, unknown>>(
  filePath: string,
  data: T,
  body: string
): Promise<void> {
  const frontmatter = YAML.stringify(data).trim();
  const content = `---\n${frontmatter}\n---\n\n${body.trimStart()}`;
  await writeFile(filePath, content.endsWith("\n") ? content : `${content}\n`, "utf8");
}
