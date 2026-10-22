// Topic mastery from repeated evidence. Each assessment adds evidence rows
// (score 0-1, weight = how much it shows); a topic's estimate is their
// recency-weighted mean, and confidence grows only with more evidence. One
// result never fixes a topic's level, and nothing here invents history.

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

const clamp = (n: number) => Math.max(0, Math.min(100, n));

export function computeMastery(rows: EvidenceRow[], now: Date = new Date()): TopicMastery[] {
  const byTopic = new Map<string, EvidenceRow[]>();
  for (const r of rows) {
    if (!(r.weight > 0) || !Number.isFinite(r.score)) continue;
    byTopic.set(r.topicKey, [...(byTopic.get(r.topicKey) ?? []), r]);
  }
  const out: TopicMastery[] = [];
  for (const [key, evidence] of byTopic) {
    const sorted = [...evidence].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    let wSum = 0;
    let swSum = 0;
    for (const e of sorted) {
      const age = Math.max(0, (now.getTime() - e.createdAt.getTime()) / DAY_MS);
      const w = e.weight * Math.pow(0.5, age / HALF_LIFE_DAYS);
      wSum += w;
      swSum += w * Math.max(0, Math.min(1, e.score));
    }
    const mean = wSum > 0 ? swSum / wSum : 0;
    const band = bandFor(wSum);
    const confidence = confidenceFor(wSum);
    const latest = sorted[sorted.length - 1];
    let trend: TopicMastery["trend"] = null;
    if (sorted.length >= 2) {
      const previous = sorted.slice(0, -1);
      const prevMean = previous.reduce((n, e) => n + e.score * e.weight, 0) / previous.reduce((n, e) => n + e.weight, 0);
      const diff = latest.score - prevMean;
      trend = diff >= 0.1 ? "up" : diff <= -0.1 ? "down" : "steady";
    }
    const status: MasteryStatus = mean < 0.6 ? "needs_review" : mean < 0.8 || confidence === "low" ? "developing" : "strong";
    out.push({
      topicKey: key,
      topicLabel: latest.topicLabel,
      classId: latest.classId,
      estimate: Math.round(mean * 100),
      low: Math.round(clamp((mean - band) * 100)),
      high: Math.round(clamp((mean + band) * 100)),
      confidence,
      status,
      evidenceCount: sorted.length,
      lastAssessed: latest.createdAt,
      trend,
    });
  }
  return out.sort((a, b) => a.estimate - b.estimate || b.lastAssessed.getTime() - a.lastAssessed.getTime());
}

/** The topic most worth reviewing next: lowest estimate among those that
 * need review, preferring recent evidence. */
export function nextReview(topics: TopicMastery[]): TopicMastery | null {
  return topics.find((t) => t.status === "needs_review") ?? topics.find((t) => t.status === "developing") ?? null;
}
