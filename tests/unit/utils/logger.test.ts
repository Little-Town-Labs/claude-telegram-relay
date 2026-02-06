/**
 * Logger utility tests
 */

import { describe, expect, test } from "vitest";
import { createLogger, logger } from "../../../src/utils/logger";

describe("Logger", () => {
  test("logger is defined", () => {
    expect(logger).toBeDefined();
  });

  test("logger has expected methods", () => {
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.debug).toBe("function");
  });

  test("createLogger creates child logger with module name", () => {
    const childLogger = createLogger("test-module");

    expect(childLogger).toBeDefined();
    expect(typeof childLogger.info).toBe("function");
  });
});
