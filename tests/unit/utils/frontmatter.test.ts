import { describe, expect, it } from "vitest";
import { parseFrontmatter, stringifyFrontmatter } from "../../../src/utils/frontmatter";

describe("parseFrontmatter", () => {
  it("parses flat key-value pairs", () => {
    const input = `---
category: people
name: Sarah
confidence: 0.92
---

Some content here.`;

    const result = parseFrontmatter(input);
    expect(result.metadata["category"]).toBe("people");
    expect(result.metadata["name"]).toBe("Sarah");
    expect(result.metadata["confidence"]).toBe(0.92);
    expect(result.content).toBe("Some content here.");
  });

  it("parses arrays with dash syntax", () => {
    const input = `---
tags:
  - marketing
  - q2
  - launch
---

Content.`;

    const result = parseFrontmatter(input);
    expect(result.metadata["tags"]).toEqual(["marketing", "q2", "launch"]);
    expect(result.content).toBe("Content.");
  });

  it("auto-detects numbers", () => {
    const input = `---
confidence: 0.85
count: 42
negative: -7
---

Body.`;

    const result = parseFrontmatter(input);
    expect(result.metadata["confidence"]).toBe(0.85);
    expect(result.metadata["count"]).toBe(42);
    expect(result.metadata["negative"]).toBe(-7);
  });

  it("auto-detects booleans", () => {
    const input = `---
enabled: true
disabled: false
---

Body.`;

    const result = parseFrontmatter(input);
    expect(result.metadata["enabled"]).toBe(true);
    expect(result.metadata["disabled"]).toBe(false);
  });

  it("returns empty metadata and full content when no frontmatter", () => {
    const input = "Just some plain text without frontmatter.";
    const result = parseFrontmatter(input);
    expect(result.metadata).toEqual({});
    expect(result.content).toBe("Just some plain text without frontmatter.");
  });

  it("handles empty frontmatter block", () => {
    const input = `---
---

Content after empty frontmatter.`;

    const result = parseFrontmatter(input);
    expect(result.metadata).toEqual({});
    expect(result.content).toBe("Content after empty frontmatter.");
  });

  it("handles empty content after frontmatter", () => {
    const input = `---
key: value
---`;

    const result = parseFrontmatter(input);
    expect(result.metadata["key"]).toBe("value");
    expect(result.content).toBe("");
  });

  it("preserves string values that look numeric but have non-numeric chars", () => {
    const input = `---
date: 2026-02-07 14:30:15
version: v1.2.3
---

Body.`;

    const result = parseFrontmatter(input);
    expect(result.metadata["date"]).toBe("2026-02-07 14:30:15");
    expect(result.metadata["version"]).toBe("v1.2.3");
  });

  it("handles values with colons", () => {
    const input = `---
context: Had a call with Sarah: discussed Q2
time: 14:30
---

Body.`;

    const result = parseFrontmatter(input);
    expect(result.metadata["context"]).toBe("Had a call with Sarah: discussed Q2");
    expect(result.metadata["time"]).toBe("14:30");
  });

  it("handles empty string values", () => {
    const input = `---
name:
notes:
---

Body.`;

    const result = parseFrontmatter(input);
    expect(result.metadata["name"]).toBe("");
    expect(result.metadata["notes"]).toBe("");
  });
});

describe("stringifyFrontmatter", () => {
  it("serializes flat key-value pairs", () => {
    const metadata = { category: "people", name: "Sarah", confidence: 0.92 };
    const content = "Some content here.";
    const result = stringifyFrontmatter(metadata, content);

    expect(result).toContain("---\n");
    expect(result).toContain("category: people\n");
    expect(result).toContain("name: Sarah\n");
    expect(result).toContain("confidence: 0.92\n");
    expect(result).toContain("---\n");
    expect(result).toContain("\nSome content here.");
  });

  it("serializes arrays with dash syntax", () => {
    const metadata = { tags: ["marketing", "q2"] };
    const content = "Content.";
    const result = stringifyFrontmatter(metadata, content);

    expect(result).toContain("tags:\n  - marketing\n  - q2\n");
  });

  it("serializes booleans", () => {
    const metadata = { enabled: true, disabled: false };
    const content = "";
    const result = stringifyFrontmatter(metadata, content);

    expect(result).toContain("enabled: true\n");
    expect(result).toContain("disabled: false\n");
  });

  it("handles empty metadata", () => {
    const result = stringifyFrontmatter({}, "Content only.");
    expect(result).toBe("---\n---\n\nContent only.");
  });

  it("handles empty content", () => {
    const result = stringifyFrontmatter({ key: "value" }, "");
    expect(result).toContain("key: value");
    expect(result.endsWith("---\n\n")).toBe(true);
  });
});

describe("roundtrip", () => {
  it("parse(stringify(data)) preserves flat values", () => {
    const metadata = { category: "projects", name: "Website Redesign", confidence: 0.88 };
    const content = "## Notes\n\nSome project notes.";

    const serialized = stringifyFrontmatter(metadata, content);
    const parsed = parseFrontmatter(serialized);

    expect(parsed.metadata["category"]).toBe("projects");
    expect(parsed.metadata["name"]).toBe("Website Redesign");
    expect(parsed.metadata["confidence"]).toBe(0.88);
    expect(parsed.content).toBe(content);
  });

  it("parse(stringify(data)) preserves arrays", () => {
    const metadata = { tags: ["a", "b", "c"] };
    const content = "Body text.";

    const serialized = stringifyFrontmatter(metadata, content);
    const parsed = parseFrontmatter(serialized);

    expect(parsed.metadata["tags"]).toEqual(["a", "b", "c"]);
  });
});
