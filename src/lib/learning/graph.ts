// Topic prerequisite graph: cycle checks and remediation. Pure.
// An edge { topicId, prerequisiteId } means "learn prerequisiteId before topicId".

import type { MasteryStatusV2, TopicEstimate } from "./estimator";

export interface Edge {
  topicId: string;
  prerequisiteId: string;
}

/** True if adding "topicId needs prerequisiteId" would close a loop
 * (including a topic needing itself). */
export function wouldCreateCycle(edges: Edge[], topicId: string, prerequisiteId: string): boolean {
  if (topicId === prerequisiteId) return true;
  // A cycle appears if topicId is already (transitively) a prerequisite of prerequisiteId.
  const needs = new Map<string, string[]>();
  for (const e of edges) {
    const list = needs.get(e.topicId);
    if (list) list.push(e.prerequisiteId);
    else needs.set(e.topicId, [e.prerequisiteId]);
  }
  const stack = [prerequisiteId];
  const seen = new Set<string>();
  while (stack.length) {
    const current = stack.pop()!;
    if (current === topicId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of needs.get(current) ?? []) stack.push(next);
  }
  return false;
}

export type Remediation =
  | { kind: "prerequisite"; topicId: string; title: string; status: MasteryStatusV2; depth: number; reason: string }
  | { kind: "self"; reason: string };

const MAX_DEPTH = 4;

/** Is this topic struggling enough to look at its prerequisites? */
export function isStruggling(e: TopicEstimate): boolean {
  if (e.status === "needs_review") return true;
  return e.status === "developing" && e.estimate !== null && e.estimate < 70;
}

const STATUS_RANK: Record<MasteryStatusV2, number> = { needs_review: 0, not_enough_evidence: 1, developing: 2, secure: 3 };

/** For a struggling topic, the weakest prerequisite to work on first (walking
 * up to four levels back), with the reason. Null when the topic isn't
 * struggling or has no prerequisites. */
export function recommendRemediation(
  topicId: string,
  topics: { id: string; title: string }[],
  edges: Edge[],
  estimates: Map<string, TopicEstimate>,
): Remediation | null {
  const own = estimates.get(topicId);
  if (!own || !isStruggling(own)) return null;
  const titles = new Map(topics.map((t) => [t.id, t.title]));
  const needs = new Map<string, string[]>();
  for (const e of edges) {
    const list = needs.get(e.topicId);
    if (list) list.push(e.prerequisiteId);
    else needs.set(e.topicId, [e.prerequisiteId]);
  }
  // Breadth-first, so each prerequisite gets its shortest distance.
  const depthOf = new Map<string, number>();
  let frontier = needs.get(topicId) ?? [];
  for (let depth = 1; depth <= MAX_DEPTH && frontier.length; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      if (id === topicId || depthOf.has(id) || !titles.has(id)) continue;
      depthOf.set(id, depth);
      next.push(...(needs.get(id) ?? []));
    }
    frontier = next;
  }
  if (depthOf.size === 0) return null;

  const candidates = [...depthOf.entries()]
    .map(([id, depth]) => ({ id, depth, estimate: estimates.get(id) }))
    .filter((c) => (c.estimate?.status ?? "not_enough_evidence") !== "secure");
  if (candidates.length === 0) {
    return {
      kind: "self",
      reason: "Its prerequisites look secure, so the gap is probably in this topic itself. Review it directly.",
    };
  }
  candidates.sort((a, b) => {
    const sa = STATUS_RANK[a.estimate?.status ?? "not_enough_evidence"];
    const sb = STATUS_RANK[b.estimate?.status ?? "not_enough_evidence"];
    if (sa !== sb) return sa - sb;
    const ea = a.estimate?.estimate ?? 101;
    const eb = b.estimate?.estimate ?? 101;
    if (ea !== eb) return ea - eb;
    if (a.depth !== b.depth) return a.depth - b.depth;
    return (titles.get(a.id) ?? "").localeCompare(titles.get(b.id) ?? "");
  });
  const pick = candidates[0];
  const title = titles.get(pick.id)!;
  const status = pick.estimate?.status ?? "not_enough_evidence";
  const via = pick.depth > 1 ? " (it comes earlier in the chain)" : "";
  let reason: string;
  if (status === "needs_review") reason = `${title} is a prerequisite${via} and also needs review, so it may be behind the trouble here.`;
  else if (status === "not_enough_evidence") reason = `${title} is a prerequisite${via} you haven't practiced enough to know. Check it first.`;
  else reason = `${title} is a prerequisite${via} that's still developing${pick.estimate?.estimate != null ? ` (about ${pick.estimate.estimate}%)` : ""}.`;
  return { kind: "prerequisite", topicId: pick.id, title, status, depth: pick.depth, reason };
}
