// Topic mastery from repeated evidence (score 0-1, weight = how much it shows).
// A topic's estimate is the recency-weighted mean; confidence grows only with
// more evidence, so one result never fixes a topic's level.

export interface EvidenceRow {
  topicKey: string;
  topicLabel: string;
  classId: string | null;
  score: number;
  weight: number;
  createdAt: Date;
}

export type Confidence = "low" | "medium" | "high";
export type MasteryStatus = "needs_review" | "developing" | "strong";

export interface TopicMastery {
  topicKey: string;
  topicLabel: string;
  classId: string | null;
  /** 0-100 */
  estimate: number;
  low: number;
  high: number;
  confidence: Confidence;
  status: MasteryStatus;
  evidenceCount: number;
  lastAssessed: Date;
  /** Only when there are at least two pieces of evidence. */
  trend: "up" | "down" | "steady" | null;
}

const HALF_LIFE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function topicKey(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

export function confidenceFor(effectiveItems: number): Confidence {
  if (effectiveItems < 3) return "low";
  if (effectiveItems < 8) return "medium";
  return "high";
}

/** Half-width of the estimate band, in score units (0-1). Wide with little evidence. */
export function bandFor(effectiveItems: number): number {
  return Math.min(0.5, 0.5 / Math.sqrt(effectiveItems + 1));
}

function clampPercent(n: number): number {
  return Math.max(0, Math.min(100, n));
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(1, score));
}

/** Compares the latest score with the weighted mean of all earlier ones. */
function trendFor(sorted: EvidenceRow[]): TopicMastery["trend"] {
  if (sorted.length < 2) return null;
  const latest = sorted[sorted.length - 1];
  let weightedScores = 0;
  let weights = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    weightedScores += sorted[i].score * sorted[i].weight;
    weights += sorted[i].weight;
  }
  const diff = latest.score - weightedScores / weights;
  if (diff >= 0.1) return "up";
  if (diff <= -0.1) return "down";
  return "steady";
}

function statusFor(mean: number, confidence: Confidence): MasteryStatus {
  if (mean < 0.6) return "needs_review";
  if (mean < 0.8 || confidence === "low") return "developing";
  return "strong";
}

function masteryForTopic(key: string, evidence: EvidenceRow[], now: Date): TopicMastery {
  const sorted = [...evidence].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  // Recency-weighted mean: evidence loses half its weight every HALF_LIFE_DAYS.
  let totalWeight = 0;
  let weightedScoreSum = 0;
  for (const e of sorted) {
    const ageDays = Math.max(0, (now.getTime() - e.createdAt.getTime()) / DAY_MS);
    const weight = e.weight * Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
    totalWeight += weight;
    weightedScoreSum += weight * clampScore(e.score);
  }
  const mean = totalWeight > 0 ? weightedScoreSum / totalWeight : 0;
  const band = bandFor(totalWeight);
  const confidence = confidenceFor(totalWeight);
  const latest = sorted[sorted.length - 1];

  return {
    topicKey: key,
    topicLabel: latest.topicLabel,
    classId: latest.classId,
    estimate: Math.round(mean * 100),
    low: Math.round(clampPercent((mean - band) * 100)),
    high: Math.round(clampPercent((mean + band) * 100)),
    confidence,
    status: statusFor(mean, confidence),
    evidenceCount: sorted.length,
    lastAssessed: latest.createdAt,
    trend: trendFor(sorted),
  };
}

/** Weakest topics first; ties go to the most recently assessed. */
function compareTopics(a: TopicMastery, b: TopicMastery): number {
  if (a.estimate !== b.estimate) return a.estimate - b.estimate;
  return b.lastAssessed.getTime() - a.lastAssessed.getTime();
}

export function computeMastery(rows: EvidenceRow[], now: Date = new Date()): TopicMastery[] {
  const byTopic = new Map<string, EvidenceRow[]>();
  for (const row of rows) {
    // Skip rows with no usable weight (also catches NaN) or a broken score.
    const hasWeight = row.weight > 0;
    if (!hasWeight || !Number.isFinite(row.score)) continue;

    let list = byTopic.get(row.topicKey);
    if (!list) {
      list = [];
      byTopic.set(row.topicKey, list);
    }
    list.push(row);
  }

  const topics: TopicMastery[] = [];
  for (const [key, evidence] of byTopic) {
    topics.push(masteryForTopic(key, evidence, now));
  }
  return topics.sort(compareTopics);
}

/** The topic most worth reviewing next: lowest estimate among those that
 * need review, preferring recent evidence. */
export function nextReview(topics: TopicMastery[]): TopicMastery | null {
  const needsReview = topics.find((t) => t.status === "needs_review");
  if (needsReview) return needsReview;
  const developing = topics.find((t) => t.status === "developing");
  if (developing) return developing;
  return null;
}
