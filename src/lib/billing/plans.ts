// Plans and allowances: the one place prices and quotas live. `monthlyCostCapUsd`
// is a hard cap on AI cost per student per month (disclosed in the billing
// terms), so heavy use never costs more than the plan earns.

export type PlanId = "FREE" | "PLUS" | "PRO";
export type AiFeature = "tutor_message" | "photo_assessment" | "draft_review" | "quick_add" | "screenshot_import" | "practice_questions";

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthlyUsd: number;
  tagline: string;
  monthly: Record<"tutor_message" | "photo_assessment" | "draft_review", number>;
  /** All AI requests per UTC day, across features. */
  dailyRequests: number;
  monthlyCostCapUsd: number;
  maxConcurrent: number;
  highlights: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  FREE: {
    id: "FREE",
    name: "Free",
    priceMonthlyUsd: 0,
    tagline: "Plan your week and try the learning tools.",
    monthly: { tutor_message: 15, photo_assessment: 3, draft_review: 2 },
    dailyRequests: 10,
    monthlyCostCapUsd: 1.5,
    maxConcurrent: 1,
    highlights: [
      "Unlimited study planning and Canvas sync",
      "15 tutor messages a month",
      "3 photo practice checks a month",
      "2 rubric reviews a month",
      "Mastery tracking",
    ],
  },
  PLUS: {
    id: "PLUS",
    name: "Plus",
    priceMonthlyUsd: 10,
    tagline: "For students who study with Rushd every week.",
    monthly: { tutor_message: 150, photo_assessment: 30, draft_review: 20 },
    dailyRequests: 60,
    monthlyCostCapUsd: 8,
    maxConcurrent: 2,
    highlights: [
      "Everything in Free",
      "150 tutor messages a month",
      "30 photo practice checks a month",
      "20 rubric reviews a month",
    ],
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    priceMonthlyUsd: 20,
    tagline: "For heavy course loads and exam seasons.",
    monthly: { tutor_message: 400, photo_assessment: 80, draft_review: 50 },
    dailyRequests: 150,
    monthlyCostCapUsd: 16,
    maxConcurrent: 3,
    highlights: [
      "Everything in Plus",
      "400 tutor messages a month",
      "80 photo practice checks a month",
      "50 rubric reviews a month",
    ],
  },
};

export const FEATURE_LABEL: Record<AiFeature, string> = {
  tutor_message: "Tutor messages",
  photo_assessment: "Photo practice checks",
  draft_review: "Rubric reviews",
  quick_add: "Quick add",
  screenshot_import: "Screenshot import",
  practice_questions: "Generated practice questions",
};

/** Features with a per-plan monthly count. The two small extraction
 * features and practice-question generation count only toward the daily
 * request and cost limits. */
export function monthlyAllowance(plan: Plan, feature: AiFeature): number | null {
  if (feature === "tutor_message" || feature === "photo_assessment" || feature === "draft_review") {
    return plan.monthly[feature];
  }
  return null;
}
