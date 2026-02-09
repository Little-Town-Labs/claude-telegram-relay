/**
 * MessageQueue tests
 */

import { describe, expect, test } from "vitest";
import { MessageQueue } from "../../../src/utils/queue";

describe("MessageQueue", () => {
  test("enqueue/dequeue maintains FIFO order", async () => {
    const queue = new MessageQueue();
    const results: number[] = [];

    // Enqueue three async operations
    queue.enqueue(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      results.push(1);
    });
    queue.enqueue(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      results.push(2);
    });
    queue.enqueue(async () => {
      results.push(3);
    });

    // Wait for all operations to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Despite different execution times, FIFO order should be maintained
    expect(results).toEqual([1, 2, 3]);
  });

  test("processes tasks sequentially (one at a time)", async () => {
    const queue = new MessageQueue();
    const executionLog: string[] = [];

    queue.enqueue(async () => {
      executionLog.push("task1-start");
      await new Promise((resolve) => setTimeout(resolve, 20));
      executionLog.push("task1-end");
    });

    queue.enqueue(async () => {
      executionLog.push("task2-start");
      await new Promise((resolve) => setTimeout(resolve, 10));
      executionLog.push("task2-end");
    });

    // Wait for all tasks to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Task 2 should not start until task 1 ends
    expect(executionLog).toEqual(["task1-start", "task1-end", "task2-start", "task2-end"]);
  });

  test("size() returns pending items count", async () => {
    const queue = new MessageQueue();

    expect(queue.size()).toBe(0);

    queue.enqueue(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    queue.enqueue(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    // First task starts immediately, so only 1 is pending
    expect(queue.size()).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, 30));

    // All tasks completed
    expect(queue.size()).toBe(0);
  });

  test("isProcessing() tracks execution state", async () => {
    const queue = new MessageQueue();

    expect(queue.isProcessing()).toBe(false);

    queue.enqueue(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    // Should start processing immediately
    expect(queue.isProcessing()).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 30));

    // Processing complete
    expect(queue.isProcessing()).toBe(false);
  });

  test("error in one task does not block subsequent tasks", async () => {
    const queue = new MessageQueue();
    const results: string[] = [];

    queue.enqueue(async () => {
      results.push("task1");
      throw new Error("Task 1 failed");
    });

    queue.enqueue(async () => {
      results.push("task2");
    });

    queue.enqueue(async () => {
      results.push("task3");
    });

    // Wait for all tasks to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Task 2 and 3 should execute despite task 1 error
    expect(results).toEqual(["task1", "task2", "task3"]);
    expect(queue.size()).toBe(0);
    expect(queue.isProcessing()).toBe(false);
  });

  test("starts processing immediately on first enqueue", async () => {
    const queue = new MessageQueue();
    let executed = false;

    queue.enqueue(async () => {
      executed = true;
    });

    // Give minimal time for async execution to start
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(executed).toBe(true);
  });

  test("handles empty queue gracefully", () => {
    const queue = new MessageQueue();

    expect(queue.size()).toBe(0);
    expect(queue.isProcessing()).toBe(false);
  });
});
