/**
 * Minimal YAML frontmatter parser/serializer.
 *
 * Handles flat key-value pairs, simple arrays (dash syntax),
 * auto-detection of numbers and booleans. No nested objects.
 */

import type { FrontmatterResult } from "../types/secondbrain";

/**
 * Parse markdown file content with YAML frontmatter.
 * Splits on --- delimiters, parses flat key-value YAML.
 */
export function parseFrontmatter(fileContent: string): FrontmatterResult {
  const trimmed = fileContent.trimStart();

  if (!trimmed.startsWith("---")) {
    return { metadata: {}, content: fileContent };
  }

  const endIndex = trimmed.indexOf("---", 3);
  if (endIndex === -1) {
    return { metadata: {}, content: fileContent };
  }

  const yamlBlock = trimmed.slice(3, endIndex).trim();
  const rest = trimmed.slice(endIndex + 3);
  const content = rest.startsWith("\n") ? rest.slice(1) : rest;

  const metadata: Record<string, unknown> = {};

  if (yamlBlock.length === 0) {
    return { metadata, content: content.trim() };
  }

  const lines = yamlBlock.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] as string;

    // Match key: value
    const match = /^([a-zA-Z_][\w]*)\s*:\s*(.*)$/.exec(line);
    if (!match) {
      i++;
      continue;
    }

    const key = match[1] as string;
    const rawValue = (match[2] as string).trim();

    // Check if next lines are array items
    if (rawValue === "" && i + 1 < lines.length && /^\s+-\s/.test(lines[i + 1] as string)) {
      const result = parseArrayItems(lines, i + 1);
      metadata[key] = result.items;
      i = result.nextIndex;
      continue;
    }

    metadata[key] = parseValue(rawValue);
    i++;
  }

  return { metadata, content: content.trim() };
}

/**
 * Serialize metadata + content into markdown with YAML frontmatter.
 */
export function stringifyFrontmatter(metadata: Record<string, unknown>, content: string): string {
  const lines: string[] = ["---"];

  for (const [key, value] of Object.entries(metadata)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${String(item)}`);
      }
    } else {
      lines.push(`${key}: ${String(value ?? "")}`);
    }
  }

  lines.push("---");
  lines.push("");
  lines.push(content);

  return lines.join("\n");
}

function parseArrayItems(
  lines: string[],
  startIndex: number
): { items: string[]; nextIndex: number } {
  const items: string[] = [];
  let i = startIndex;
  while (i < lines.length && /^\s+-\s/.test(lines[i] as string)) {
    const itemMatch = /^\s+-\s+(.*)$/.exec(lines[i] as string);
    if (itemMatch) {
      items.push((itemMatch[1] as string).trim());
    }
    i++;
  }
  return { items, nextIndex: i };
}

function parseValue(raw: string): unknown {
  if (raw === "") return "";
  if (raw === "true") return true;
  if (raw === "false") return false;

  // Only parse as number if it's purely numeric (with optional sign and decimal)
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    return Number(raw);
  }

  return raw;
}
