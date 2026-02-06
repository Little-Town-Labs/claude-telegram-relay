/**
 * Telegram utility functions
 * Extracted from relay.ts:336-368
 */

import type { Context } from "grammy";

/** Telegram message character limit */
const MAX_MESSAGE_LENGTH = 4000;

/**
 * Send a response, chunking if necessary to stay within Telegram limits
 * Attempts to split at natural boundaries (paragraphs, lines, words)
 */
export async function sendResponse(ctx: Context, response: string): Promise<void> {
  if (response.length <= MAX_MESSAGE_LENGTH) {
    await ctx.reply(response);
    return;
  }

  const chunks = splitMessage(response, MAX_MESSAGE_LENGTH);

  for (const chunk of chunks) {
    await ctx.reply(chunk);
  }
}

/**
 * Split a message into chunks at natural boundaries
 */
export function splitMessage(text: string, maxLength: number): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to split at natural boundaries
    let splitIndex = remaining.lastIndexOf("\n\n", maxLength);
    if (splitIndex === -1) {
      splitIndex = remaining.lastIndexOf("\n", maxLength);
    }
    if (splitIndex === -1) {
      splitIndex = remaining.lastIndexOf(" ", maxLength);
    }
    if (splitIndex === -1) {
      splitIndex = maxLength;
    }

    chunks.push(remaining.substring(0, splitIndex));
    remaining = remaining.substring(splitIndex).trim();
  }

  return chunks;
}

/**
 * Format a timestamp for display
 */
export function formatTimestamp(date: Date = new Date()): string {
  return date.toLocaleString("en-US", {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Build a prompt with context
 */
export function buildPrompt(userMessage: string, additionalContext?: string): string {
  const timeStr = formatTimestamp();

  let prompt = `You are responding via Telegram. Keep responses concise.

Current time: ${timeStr}`;

  if (additionalContext) {
    prompt += `\n\n${additionalContext}`;
  }

  prompt += `\n\nUser: ${userMessage}`;

  return prompt.trim();
}
