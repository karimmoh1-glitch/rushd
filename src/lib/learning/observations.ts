import type { Observation } from "./estimator";

// Turns stored MasteryEvidence rows into estimator observations. Pure.

export interface EvidenceRowV2 {
  id: string;
  createdAt: Date;
  score: number;
  weight: number;
  assessmentId: string | null;
  sessionId: string | null;
  questionId: string | null;
  result: "CORRECT" | "PARTIAL" | "INCORRECT" | null;
  difficulty: number | null;
  hintsUsed: number | null;
  confidence: number | null;
}

const RESULT_SCORE = { CORRECT: 1, PARTIAL: 0.5, INCORRECT: 0 } as const;

export function toObservation(row: EvidenceRowV2): Observation {
  if (row.result) {
    // One practice answer.
    return {
      at: row.createdAt,
      score: RESULT_SCORE[row.result],
      items: 1,
      difficulty: row.difficulty,
      hintsUsed: row.hintsUsed,
      confidence: row.confidence,
      sessionKey: row.sessionId ?? `evidence:${row.id}`,
      questionId: row.questionId,
    };
  }
  // A photo check (or older evidence): one sitting standing for several answers.
  return {
    at: row.createdAt,
    score: row.score,
    items: Math.max(1, Math.round(row.weight)),
    sessionKey: row.assessmentId ? `assessment:${row.assessmentId}` : `evidence:${row.id}`,
  };
}
