/**
 * MessageQueue - Promise-chain-based FIFO queue
 *
 * Ensures async operations execute sequentially in the order they were enqueued.
 * Based on research.md R4.
 */

export class MessageQueue {
  private chain: Promise<void> = Promise.resolve();
  private pending = 0;
  private processing = false;

  /**
   * Adds an async operation to the FIFO queue.
   * If queue was empty, execution begins immediately.
   */
  enqueue(fn: () => Promise<void>): void {
    // Track whether this is the first item (starts immediately)
    const wasIdle = !this.processing && this.pending === 0;

    if (wasIdle) {
      this.processing = true;
    } else {
      this.pending++;
    }

    this.chain = this.chain.then(async () => {
      // Decrement pending count when starting execution
      if (!wasIdle) {
        this.pending--;
      }

      try {
        await fn();
      } catch (error) {
        // Log error but don't rethrow - allows subsequent tasks to run
        console.error("Queue task error:", error);
      } finally {
        // Mark as not processing if queue is empty
        if (this.pending === 0) {
          this.processing = false;
        }
      }
    });
  }

  /**
   * Returns pending (not yet started) items count
   */
  size(): number {
    return this.pending;
  }

  /**
   * Returns true if a queued function is currently executing
   */
  isProcessing(): boolean {
    return this.processing;
  }
}
