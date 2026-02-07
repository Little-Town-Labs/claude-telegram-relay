/**
 * Test setup and fixtures
 */

import { EventEmitter } from "events";
import { vi } from "vitest";

// Re-export vitest mock as 'mock' for compatibility
const mock = vi.fn;

/**
 * Mock environment variables for tests
 */
export function mockEnv(overrides: Record<string, string | undefined> = {}) {
  const originalEnv = { ...process.env };

  const testEnv: Record<string, string | undefined> = {
    TELEGRAM_BOT_TOKEN: "test-bot-token",
    TELEGRAM_USER_ID: "123456789",
    CLAUDE_PATH: "/usr/bin/claude",
    RELAY_DIR: "/tmp/test-relay",
    NODE_ENV: "test",
    LOG_LEVEL: "error", // Suppress logs in tests
    ...overrides,
  };

  for (const [key, value] of Object.entries(testEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return () => {
    // Restore original environment
    for (const key of Object.keys(testEnv)) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  };
}

/**
 * Mock file system operations
 */
export const mockFs = {
  readFile: mock(() => Promise.resolve("")),
  writeFile: mock(() => Promise.resolve()),
  unlink: mock(() => Promise.resolve()),
  mkdir: mock(() => Promise.resolve()),
};

/**
 * Mock Grammy context
 */
export function createMockContext(overrides: Partial<MockContextOptions> = {}): MockContext {
  return {
    from: {
      id: overrides.userId ?? 123456789,
      is_bot: false,
      first_name: "Test",
    },
    message: {
      text: overrides.messageText ?? "Hello",
      message_id: 1,
      date: Date.now(),
      chat: {
        id: overrides.chatId ?? 123456789,
        type: "private",
      },
    },
    reply: mock(() => Promise.resolve({ message_id: 2 })),
    replyWithChatAction: mock(() => Promise.resolve(true)),
    api: {
      getFile: mock(() => Promise.resolve({ file_path: "test/file.jpg" })),
    },
    getFile: mock(() => Promise.resolve({ file_path: "test/file.jpg" })),
  } as unknown as MockContext;
}

interface MockContextOptions {
  userId: number;
  chatId: number;
  messageText: string;
}

interface MockContext {
  from: { id: number; is_bot: boolean; first_name: string };
  message: { text: string; message_id: number; date: number; chat: { id: number; type: string } };
  reply: ReturnType<typeof mock>;
  replyWithChatAction: ReturnType<typeof mock>;
  api: { getFile: ReturnType<typeof mock> };
  getFile: ReturnType<typeof mock>;
}

/**
 * Mock Claude CLI spawn (legacy Bun-style ReadableStream)
 */
export function createMockSpawn(output: string, exitCode = 0) {
  return mock(() => ({
    stdout: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(output));
        controller.close();
      },
    }),
    stderr: new ReadableStream({
      start(controller) {
        controller.close();
      },
    }),
    exited: Promise.resolve(exitCode),
  }));
}

/**
 * Mock Node.js child_process.spawn ChildProcess
 * Returns an object that mimics ChildProcess with EventEmitter-based
 * stdout/stderr streams and a close event.
 */
export function createMockSpawnNode(
  output: string,
  exitCode = 0,
  options?: { stderr?: string; delay?: number }
) {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    pid: number;
    kill: ReturnType<typeof mock>;
  };

  proc.stdout = stdout;
  proc.stderr = stderr;
  proc.pid = 12345;
  proc.kill = mock(() => true);

  // Emit data and close asynchronously
  const delay = options?.delay ?? 0;
  setTimeout(() => {
    if (output) {
      stdout.emit("data", Buffer.from(output));
    }
    if (options?.stderr) {
      stderr.emit("data", Buffer.from(options.stderr));
    }
    proc.emit("close", exitCode);
  }, delay);

  return proc;
}
