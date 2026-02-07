/**
 * Configuration loader with validation
 */

import { join } from "path";
import { ZodError } from "zod";
import type { AppConfig } from "../types/config";
import { configSchema, parseEnvVars } from "./schema";

export { configSchema } from "./schema";

/**
 * Load and validate configuration from environment variables
 * @throws Error if required config is missing or invalid
 */
export function loadConfig(): AppConfig {
  const input = parseEnvVars();

  try {
    const validated = configSchema.parse(input);

    // Derive additional paths from relayDir
    const relayDir = validated.relayDir;

    return {
      ...validated,
      tempDir: join(relayDir, "temp"),
      uploadsDir: join(relayDir, "uploads"),
      sessionFile: join(relayDir, "session.json"),
      lockFile: join(relayDir, "bot.lock"),
      memoryFile: validated.memoryFile || join(relayDir, "memory.json"),
    };
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
      throw new Error(`Configuration validation failed:\n${issues.join("\n")}`);
    }
    throw error;
  }
}

/**
 * Validate configuration without throwing
 * Returns validation result with errors if any
 */
export function validateConfig():
  | { success: true; config: AppConfig }
  | { success: false; errors: string[] } {
  try {
    const config = loadConfig();
    return { success: true, config };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, errors: [error.message] };
    }
    return { success: false, errors: ["Unknown configuration error"] };
  }
}
