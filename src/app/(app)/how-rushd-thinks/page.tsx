import type { Metadata } from "next";
import { Brain, Scale, Clock3, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { buildEstimationProfile } from "@/lib/estimation/build-estimation-profile";
import { buildPatterns } from "@/lib/patterns/build-patterns";
import type { SessionRecord } from "@/lib/insights/build-insights";
import { SCORING_WEIGHTS } from "@/lib/planning/constants";
import { logEvent } from "@/lib/analytics/log-event";
import { Card, CardContent } from "@/components/ui/card";
import { Reveal } from "@/components/reveal";

export const metadata: Metadata = {
  title: "How Rushd thinks",
};

const SCORING_FACTORS = [
  {
    label: "How soon it's due",
    body: `Every open item starts gaining urgency as its deadline approaches — up to ${SCORING_WEIGHTS.urgencyMax} points at the max, losing ${SCORING_WEIGHTS.urgencyPerDay} points for every day further out. Nothing gets ranked by deadline alone, but this is usually the biggest single factor.`,
  },
  {
    label: "Priority you set",
    body: `Marking something High priority adds ${SCORING_WEIGHTS.priorityWeight.HIGH} points. A high-priority class adds up to ${Math.round(SCORING_WEIGHTS.priorityWeight.HIGH * SCORING_WEIGHTS.classPriorityMultiplier)} more, at half the weight of the item's own priority — your call on one assignment always outweighs a general class setting.`,
  },
  {
    label: "Overdue work",
    body: `The moment something is late, it jumps by ${SCORING_WEIGHTS.overdueBase} points immediately, plus ${SCORING_WEIGHTS.overduePerDay} more per day late, capped at ${SCORING_WEIGHTS.overdueCap} total. Overdue work never quietly sinks to the bottom of the list.`,
  },
  {
    label: "Exam proximity",
    body: `Exams within ${SCORING_WEIGHTS.examProximityWindowDays} days get an escalating boost as the date gets closer — up to ${SCORING_WEIGHTS.examProximityPerDay * SCORING_WEIGHTS.examProximityWindowDays} points the day before.`,
  },
  {
    label: "Effort tiebreaker",
    body: "When two things are otherwise close, Rushd gives a small nudge toward the shorter one — never enough to override urgency or priority, just a tiebreaker.",
  },
];

export default async function HowRushdThinksPage() {
  const user = await requireUser();

  const [rows] = await Promise.all([
    db.studySession.findMany({
      where: { userId: user.id, status: { in: ["COMPLETED", "ABANDONED"] } },
      select: {
        className: true,
        classColor: true,
        status: true,
        plannedMinutes: true,
        actualMinutes: true,
        perceivedDifficulty: true,
        startedAt: true,
      },
    }),
    logEvent(user.id, "how_rushd_thinks_viewed"),
  ]);
  const sessions: SessionRecord[] = rows.map((r) => ({
    className: r.className,
    classColor: r.classColor,
    status: r.status as "COMPLETED" | "ABANDONED",
    plannedMinutes: r.plannedMinutes,
    actualMinutes: r.actualMinutes,
    perceivedDifficulty: r.perceivedDifficulty,
    startedAt: r.startedAt,
  }));

  const estimationProfile = buildEstimationProfile(sessions);
  const patterns = buildPatterns(sessions);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-heading text-3xl font-semibold">How Rushd thinks</h1>
        <p className="mt-1 max-w-2xl text-base text-muted-foreground">
          Nothing here is a black box. Every recommendation is arithmetic over your real data —
          no model guessing at what you should do.
        </p>
      </div>

      <Reveal>
        <Card className="border-primary/30 bg-accent/20">
          <CardContent className="flex items-start gap-3 py-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Rushd&apos;s plan comes from a deterministic scoring engine — the same inputs always
              produce the same plan. AI (when used, like reading a screenshot) only ever helps
              enter data faster; it never decides what you should work on or how it&apos;s scored.
            </p>
          </CardContent>
        </Card>
      </Reveal>

      <Reveal delay={0.06}>
        <section>
          <h2 className="mb-3 flex items-center gap-2 font-heading text-lg font-semibold">
            <Scale className="h-4 w-4 text-primary" aria-hidden="true" />
            How prioritization works
          </h2>
          <div className="space-y-3">
            {SCORING_FACTORS.map((f) => (
              <div key={f.label} className="rounded-lg border border-border px-4 py-3">
                <p className="font-medium">{f.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>
      </Reveal>

      <Reveal delay={0.12}>
        <section>
          <h2 className="mb-1 flex items-center gap-2 font-heading text-lg font-semibold">
            <Clock3 className="h-4 w-4 text-primary" aria-hidden="true" />
            Your estimation profile
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            When you have enough history in a class (3+ sessions, off by at least 10% on average),
            Rushd quietly calibrates future time estimates for that class — capped so one outlier
            can never double an estimate.
          </p>
          {estimationProfile.byClass.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Not calibrating anything yet — keep logging study sessions and this will fill in.
            </p>
          ) : (
            <div className="space-y-2">
              {estimationProfile.byClass.map((c) => (
                <div
                  key={c.className}
                  className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
                >
                  <p className="font-medium">{c.className}</p>
                  <p className="text-sm text-muted-foreground">
                    Estimates adjusted{" "}
                    <span className="font-medium text-foreground">
                      {c.percentOff > 0 ? `+${c.percentOff}%` : `${c.percentOff}%`}
                    </span>{" "}
                    from {c.sampleSize} session{c.sampleSize === 1 ? "" : "s"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </Reveal>

      <Reveal delay={0.18}>
        <section>
          <h2 className="mb-1 flex items-center gap-2 font-heading text-lg font-semibold">
            <Brain className="h-4 w-4 text-primary" aria-hidden="true" />
            What Rushd has learned about you
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Only patterns backed by enough real sessions show up here — never a guess dressed up
            as a fact.
          </p>
          {patterns.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing confident enough yet — this fills in as you log more study sessions.
            </p>
          ) : (
            <div className="space-y-2">
              {patterns.map((p) => (
                <div key={p.key} className="rounded-lg border border-border px-4 py-3">
                  <p className="text-sm">{p.statement}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {p.confidence === "high" ? "High confidence" : "Medium confidence"} · from{" "}
                    {p.sampleSize} session{p.sampleSize === 1 ? "" : "s"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </Reveal>
    </div>
  );
}
