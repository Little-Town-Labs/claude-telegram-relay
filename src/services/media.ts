/**
 * Media handlers for photo, document, and voice messages.
 *
 * These are extracted as testable functions that receive
 * dependencies via options objects.
 */

import { join } from "path";
import { unlink, writeFile } from "fs/promises";
import type { Context } from "grammy";
import type { Logger } from "pino";

export interface MediaHandlerOptions {
  claudeCall: (prompt: string, options: { resume?: boolean }) => Promise<string>;
  uploadsDir: string;
  botToken: string;
  logger: Logger;
}

/**
 * Handle photo messages: download highest-res, call Claude, cleanup.
 */
export async function handlePhoto(ctx: Context, options: MediaHandlerOptions): Promise<string> {
  const { claudeCall, uploadsDir, botToken, logger } = options;
  let filePath: string | undefined;

  try {
    const photos = ctx.message?.photo;
    if (!photos || photos.length === 0) {
      return "Could not access photo.";
    }

    // Get highest resolution photo (last in array)
    const photo = photos[photos.length - 1];
    if (!photo) {
      return "Could not access photo.";
    }
    const file = await ctx.api.getFile(photo.file_id);

    // Download the image
    const timestamp = Date.now();
    filePath = join(uploadsDir, `image_${timestamp}.jpg`);

    const response = await fetch(`https://api.telegram.org/file/bot${botToken}/${file.file_path}`);
    const buffer = await response.arrayBuffer();
    await writeFile(filePath, Buffer.from(buffer));

    const caption = ctx.message?.caption || "Analyze this image.";
    const prompt = `[Image: ${filePath}]\n\n${caption}`;

    const claudeResponse = await claudeCall(prompt, { resume: true });

    // Cleanup
    await unlink(filePath).catch(() => {});

    return claudeResponse;
  } catch (error: unknown) {
    const err = error as Record<string, unknown>;
    logger.error({ error: err?.["message"] }, "Photo processing error");

    // Cleanup on error
    if (filePath) {
      await unlink(filePath).catch(() => {});
    }

    return "Could not process image.";
  }
}

/**
 * Handle document messages: download, call Claude with filename, cleanup.
 */
export async function handleDocument(ctx: Context, options: MediaHandlerOptions): Promise<string> {
  const { claudeCall, uploadsDir, botToken, logger } = options;
  let filePath: string | undefined;

  try {
    const doc = ctx.message?.document;
    if (!doc) {
      return "Could not access document.";
    }

    const file = await ctx.getFile();
    const timestamp = Date.now();
    const fileName = doc.file_name || `file_${timestamp}`;
    filePath = join(uploadsDir, `${timestamp}_${fileName}`);

    const response = await fetch(`https://api.telegram.org/file/bot${botToken}/${file.file_path}`);
    const buffer = await response.arrayBuffer();
    await writeFile(filePath, Buffer.from(buffer));

    const caption = ctx.message?.caption || `Analyze: ${doc.file_name}`;
    const prompt = `[File: ${filePath}]\n\n${caption}`;

    const claudeResponse = await claudeCall(prompt, { resume: true });

    // Cleanup
    await unlink(filePath).catch(() => {});

    return claudeResponse;
  } catch (error: unknown) {
    const err = error as Record<string, unknown>;
    logger.error({ error: err?.["message"] }, "Document processing error");

    // Cleanup on error
    if (filePath) {
      await unlink(filePath).catch(() => {});
    }

    return "Could not process document.";
  }
}

/**
 * Handle voice messages: return graceful decline message.
 */
export function handleVoice(): string {
  return (
    "Voice messages require a transcription service. " +
    "Add Whisper, Gemini, or similar to handle voice."
  );
}
