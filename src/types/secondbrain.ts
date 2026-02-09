/**
 * SecondBrain types — knowledge management subsystem
 */

export const VALID_CATEGORIES = ["people", "projects", "ideas", "admin"] as const;
export type Category = (typeof VALID_CATEGORIES)[number];

export interface PeopleData {
  name: string;
  context: string;
  follow_ups?: string;
  tags?: string[];
}

export interface ProjectsData {
  name: string;
  status: "active" | "waiting" | "blocked" | "someday" | "todo";
  next_action: string;
  notes?: string;
  tags?: string[];
}

export interface IdeasData {
  name: string;
  one_liner: string;
  notes?: string;
  tags?: string[];
}

export interface AdminData {
  name: string;
  due_date?: string;
  notes?: string;
}

export type ExtractedData = PeopleData | ProjectsData | IdeasData | AdminData;

export interface Classification {
  category: Category;
  confidence: number;
  extracted_data: ExtractedData;
  reasoning: string;
}

export interface CaptureResult {
  filePath: string;
  category: Category;
  confidence: number;
  needsReview: boolean;
  filename: string;
}

export interface ScannedDocument {
  filename: string;
  filepath: string;
  category: string;
  content: string;
  frontmatter: Record<string, unknown>;
  created: Date;
  modified: Date;
  title: string;
  status?: string;
  confidence: number;
}

export interface CaptureStats {
  total: number;
  week: number;
  today: number;
  byCategory: Record<string, number>;
  avgConfidence: number;
  needsReview: number;
  actionable: number;
}

export interface WeeklySummary {
  totalCaptures: number;
  byCategory: Record<string, number>;
  activeProjects: Array<{ title: string; status?: string; filename: string }>;
  peopleFollowups: Array<{ title: string; followUps?: string; filename: string }>;
  avgConfidence: number;
  needsReviewCount: number;
}

export interface FixResult {
  success: boolean;
  oldCategory: string;
  newCategory: string;
  filename: string;
  oldPath: string;
  newPath: string;
  message: string;
}

export interface SecondBrainConfig {
  enabled: boolean;
  dataDir: string;
  confidenceThreshold: number;
  chatId: string;
  gitEnabled: boolean;
  gitAutoCommit: boolean;
  digest: {
    daily: {
      enabled: boolean;
      time: string;
      timezone: string;
      limit: number;
    };
    weekly: {
      enabled: boolean;
      day: string;
      time: string;
      timezone: string;
    };
  };
}

export interface FrontmatterResult {
  metadata: Record<string, unknown>;
  content: string;
}
