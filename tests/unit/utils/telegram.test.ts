/**
 * Telegram utility tests
 */

import { describe, expect, test } from "vitest";
import { buildPrompt, formatTimestamp, splitMessage } from "../../../src/utils/telegram";

describe("splitMessage", () => {
  test("returns single chunk for short messages", () => {
    const result = splitMessage("Hello world", 100);
    expect(result).toEqual(["Hello world"]);
  });

  test("splits at paragraph boundary", () => {
    const text = "First paragraph.\n\nSecond paragraph.";
    const result = splitMessage(text, 20);

    expect(result.length).toBe(2);
    expect(result[0]).toBe("First paragraph.");
    expect(result[1]).toBe("Second paragraph.");
  });

  test("splits at line boundary when no paragraph break", () => {
    const text = "Line one.\nLine two.\nLine three.";
    const result = splitMessage(text, 15);

    expect(result.length).toBeGreaterThan(1);
    expect(result[0]).toContain("Line one.");
  });

  test("splits at word boundary when no line break", () => {
    const text = "This is a long sentence without line breaks.";
    const result = splitMessage(text, 20);

    expect(result.length).toBeGreaterThan(1);
    // Should split at word boundary (space), not mid-word
    // First chunk is "This is a long" (14 chars) since next space would exceed limit
    expect(result[0]).toBe("This is a long");
  });

  test("handles very long words by hard breaking", () => {
    const text = "superlongwordthatexceedsmaximumlength more text";
    const result = splitMessage(text, 10);

    expect(result.length).toBeGreaterThan(1);
  });
});

describe("formatTimestamp", () => {
  test("returns formatted date string", () => {
    const date = new Date("2024-01-15T10:30:00");
    const result = formatTimestamp(date);

    expect(result).toContain("Monday");
    expect(result).toContain("January");
    expect(result).toContain("15");
    expect(result).toContain("2024");
  });

  test("uses current date when no argument", () => {
    const result = formatTimestamp();

    expect(result).toBeDefined();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(10);
  });
});

describe("buildPrompt", () => {
  test("builds basic prompt with timestamp", () => {
    const result = buildPrompt("Hello");

    expect(result).toContain("You are responding via Telegram");
    expect(result).toContain("Current time:");
    expect(result).toContain("User: Hello");
  });

  test("includes additional context when provided", () => {
    const result = buildPrompt("Hello", "MEMORY: User prefers brief answers");

    expect(result).toContain("MEMORY: User prefers brief answers");
    expect(result).toContain("User: Hello");
  });
});
