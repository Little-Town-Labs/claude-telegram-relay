/**
 * SynthesisService — analyze scanned documents to produce statistics and prioritized actions.
 */

import type { Logger } from "pino";

import type { AppConfig, CaptureStats, ScannedDocument, WeeklySummary } from "../types";
import type { ScannerService } from "./scanner";

export class SynthesisService {
  private scanner: ScannerService;

  constructor(scanner: ScannerService, _config: AppConfig, _logger: Logger) {
    this.scanner = scanner;
  }

  /**
   * Compute capture statistics from all scanned documents.
   */
  async getStats(): Promise<CaptureStats> {
    const allDocs = await this.scanner.scanAllDocuments();
    const reviewDocs = await this.scanner.getNeedsReview();

    if (allDocs.length === 0) {
      return {
        total: 0,
        week: 0,
        today: 0,
        byCategory: {},
        avgConfidence: 0,
        needsReview: reviewDocs.length,
        actionable: 0,
      };
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const byCategory: Record<string, number> = {};
    let totalConfidence = 0;
    let todayCount = 0;
    let weekCount = 0;

    for (const doc of allDocs) {
      // Category counts
      const cat = doc.category;
      byCategory[cat] = (byCategory[cat] ?? 0) + 1;

      // Confidence sum
      totalConfidence += doc.confidence;

      // Time-based counts
      if (doc.created >= todayStart) {
        todayCount++;
      }
      if (doc.created >= weekAgo) {
        weekCount++;
      }
    }

    const avgConfidence = totalConfidence / allDocs.length;

    return {
      total: allDocs.length,
      week: weekCount,
      today: todayCount,
      byCategory,
      avgConfidence,
      needsReview: reviewDocs.length,
      actionable: 0,
    };
  }

  /**
   * Get top N prioritized actionable items for daily digest.
   */
  async getDailyActions(limit?: number): Promise<ScannedDocument[]> {
    const actionable = await this.scanner.getActionableItems();
    if (actionable.length === 0) return [];

    const sorted = this.prioritizeActions(actionable);
    const cap = limit ?? 3;
    return sorted.slice(0, cap);
  }

  /**
   * Score and sort items by priority.
   * Scoring: due_date +100, created today +50, created yesterday +30, active project +20, urgency keywords +40
   */
  prioritizeActions(items: ScannedDocument[]): ScannedDocument[] {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);

    const scored = items.map((item) => {
      let score = 0;
      const fm = item.frontmatter;

      // Due date boost
      if (fm["due_date"]) score += 100;

      // Recency boost
      if (item.created >= todayStart) score += 50;
      else if (item.created >= yesterdayStart) score += 30;

      // Active project boost
      if (fm["status"] === "active") score += 20;

      // Urgency keywords
      const content = item.content.toLowerCase();
      if (/\b(urgent|asap|deadline|overdue)\b/.test(content)) score += 40;

      return { item, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.item);
  }

  /**
   * Compute a weekly summary for the weekly review digest.
   */
  async getWeeklySummary(): Promise<WeeklySummary> {
    const allDocs = await this.scanner.scanAllDocuments();
    const reviewDocs = await this.scanner.getNeedsReview();
    const weekDocs = this.scanner.filterByDate(allDocs, 7);

    if (weekDocs.length === 0) {
      return {
        totalCaptures: 0,
        byCategory: {},
        activeProjects: [],
        peopleFollowups: [],
        avgConfidence: 0,
        needsReviewCount: reviewDocs.length,
      };
    }

    const byCategory: Record<string, number> = {};
    let totalConfidence = 0;

    const activeProjects: WeeklySummary["activeProjects"] = [];
    const peopleFollowups: WeeklySummary["peopleFollowups"] = [];

    for (const doc of weekDocs) {
      byCategory[doc.category] = (byCategory[doc.category] ?? 0) + 1;
      totalConfidence += doc.confidence;

      if (doc.category === "projects" && doc.status === "active") {
        activeProjects.push({
          title: doc.title,
          status: doc.status,
          filename: doc.filename,
        });
      }

      if (doc.category === "people" && doc.frontmatter["follow_ups"]) {
        peopleFollowups.push({
          title: doc.title,
          followUps: String(doc.frontmatter["follow_ups"]),
          filename: doc.filename,
        });
      }
    }

    return {
      totalCaptures: weekDocs.length,
      byCategory,
      activeProjects,
      peopleFollowups,
      avgConfidence: totalConfidence / weekDocs.length,
      needsReviewCount: reviewDocs.length,
    };
  }
}
