/**
 * SchedulerService — schedule daily/weekly digest delivery via setTimeout.
 */

import type { Logger } from "pino";

import type { AppConfig } from "../types";
import type { DigestService } from "./digest";

interface ScheduledJob {
  name: string;
  nextRun: string;
  timer: ReturnType<typeof setTimeout> | null;
}

export class SchedulerService {
  private digestService: DigestService;
  private sendMessage: (chatId: string, text: string) => Promise<unknown>;
  private config: AppConfig;
  private log: Logger;
  private jobs: Map<string, ScheduledJob> = new Map();
  private chatId: string;

  constructor(
    digestService: DigestService,
    sendMessage: (chatId: string, text: string) => Promise<unknown>,
    config: AppConfig,
    logger: Logger
  ) {
    this.digestService = digestService;
    this.sendMessage = sendMessage;
    this.config = config;
    this.log = logger;
    this.chatId = config.secondbrain?.chatId ?? config.allowedUserId;
  }

  /**
   * Start scheduled digest jobs.
   */
  start(): void {
    const digest = this.config.secondbrain?.digest;
    if (!digest) return;

    if (digest.daily.enabled) {
      this.scheduleDaily(digest.daily.time, digest.daily.timezone);
    }

    if (digest.weekly.enabled) {
      this.scheduleWeekly(digest.weekly.day, digest.weekly.time, digest.weekly.timezone);
    }

    this.log.info({ jobs: Array.from(this.jobs.keys()) }, "Scheduler started");
  }

  /**
   * Stop all scheduled jobs.
   */
  stop(): void {
    for (const [name, job] of this.jobs) {
      if (job.timer) {
        clearTimeout(job.timer);
        job.timer = null;
      }
      this.log.debug({ name }, "Job stopped");
    }
    this.jobs.clear();
  }

  /**
   * Get next run times for all scheduled jobs.
   */
  getNextRuns(): Record<string, { name: string; nextRun: string }> {
    const result: Record<string, { name: string; nextRun: string }> = {};
    for (const [key, job] of this.jobs) {
      result[key] = { name: job.name, nextRun: job.nextRun };
    }
    return result;
  }

  /**
   * Manually trigger a job by ID.
   */
  async triggerNow(jobId: string): Promise<void> {
    if (jobId === "daily") {
      const content = await this.digestService.generateDailyDigest();
      await this.sendMessage(this.chatId, content);
    } else if (jobId === "weekly") {
      const content = await this.digestService.generateWeeklyReview();
      await this.sendMessage(this.chatId, content);
    } else {
      this.log.warn({ jobId }, "Unknown job ID");
    }
  }

  private scheduleDaily(time: string, _timezone: string): void {
    const msUntilNext = this.msUntilTime(time);
    const nextRun = new Date(Date.now() + msUntilNext).toISOString();

    const timer = setTimeout(async () => {
      try {
        await this.triggerNow("daily");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log.error({ error: msg }, "Daily digest failed");
      }
      // Reschedule for next day
      this.scheduleDaily(time, _timezone);
    }, msUntilNext);

    this.jobs.set("daily", { name: "daily", nextRun, timer });
    this.log.info({ nextRun }, "Daily digest scheduled");
  }

  private scheduleWeekly(day: string, time: string, _timezone: string): void {
    const msUntilNext = this.msUntilDayTime(day, time);
    const nextRun = new Date(Date.now() + msUntilNext).toISOString();

    const timer = setTimeout(async () => {
      try {
        await this.triggerNow("weekly");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log.error({ error: msg }, "Weekly review failed");
      }
      // Reschedule for next week
      this.scheduleWeekly(day, time, _timezone);
    }, msUntilNext);

    this.jobs.set("weekly", { name: "weekly", nextRun, timer });
    this.log.info({ nextRun, day }, "Weekly review scheduled");
  }

  private msUntilTime(time: string): number {
    const [hours, minutes] = time.split(":").map(Number);
    const h = hours ?? 0;
    const m = minutes ?? 0;

    const now = new Date();
    const target = new Date(now);
    target.setHours(h, m, 0, 0);

    if (target <= now) {
      target.setDate(target.getDate() + 1);
    }

    return target.getTime() - now.getTime();
  }

  private msUntilDayTime(day: string, time: string): number {
    const dayMap: Record<string, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };

    const targetDay = dayMap[day.toLowerCase()] ?? 0;
    const [hours, minutes] = time.split(":").map(Number);
    const h = hours ?? 0;
    const m = minutes ?? 0;

    const now = new Date();
    const target = new Date(now);
    target.setHours(h, m, 0, 0);

    // Calculate days until target day
    const currentDay = now.getDay();
    let daysUntil = targetDay - currentDay;
    if (daysUntil < 0) daysUntil += 7;
    if (daysUntil === 0 && target <= now) daysUntil = 7;

    target.setDate(target.getDate() + daysUntil);

    return target.getTime() - now.getTime();
  }
}
