/**
 * Memory types for persistent facts and goals
 * Based on patterns from examples/memory.ts
 */

export interface Memory {
  /** Facts to always remember */
  facts: string[];

  /** Active goals with optional deadlines */
  goals: Goal[];

  /** Completed goals for history */
  completedGoals: CompletedGoal[];
}

export interface Goal {
  /** Goal description */
  text: string;

  /** Optional deadline (ISO string or natural language) */
  deadline?: string;

  /** ISO timestamp when goal was created */
  createdAt: string;
}

export interface CompletedGoal {
  /** Goal description */
  text: string;

  /** ISO timestamp when goal was completed */
  completedAt: string;
}

/**
 * Intent detection results from Claude's response
 */
export interface DetectedIntents {
  /** Fact to remember: [REMEMBER: fact] */
  remember?: string;

  /** Goal to track: [GOAL: text | DEADLINE: optional] */
  goal?: {
    text: string;
    deadline?: string;
  };

  /** Goal completed: [DONE: search text] */
  done?: string;
}

export interface MemoryService {
  /** Load memory from persistence */
  load(): Promise<Memory>;

  /** Save memory to persistence */
  save(memory: Memory): Promise<void>;

  /** Add a new fact */
  addFact(fact: string): Promise<string>;

  /** Add a new goal */
  addGoal(text: string, deadline?: string): Promise<string>;

  /** Complete a goal by search text */
  completeGoal(searchText: string): Promise<string>;

  /** Get formatted memory context for prompts */
  getContext(): Promise<string>;
}
