import type { Metadata } from "next";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "Admin",
};

export default async function AdminPage() {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    activeUserIds,
    recentSignups,
    eventCounts,
    recentEvents,
    recentFeedback,
    totalClasses,
    totalAssignments,
    totalExams,
    totalPlansGenerated,
  ] = await Promise.all([
    db.user.count(),
    db.event.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      distinct: ["userId"],
      select: { userId: true },
    }),
    db.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, email: true, createdAt: true, onboardingCompletedAt: true },
    }),
    db.event.groupBy({
      by: ["name"],
      where: { createdAt: { gte: sevenDaysAgo } },
      _count: { name: true },
      orderBy: { _count: { name: "desc" } },
    }),
    db.event.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { name: true, createdAt: true, user: { select: { email: true } } },
    }),
    db.feedback.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        context: true,
        rating: true,
        message: true,
        createdAt: true,
        user: { select: { email: true } },
      },
    }),
    db.class.count(),
    db.assignment.count(),
    db.exam.count(),
    db.plan.count(),
  ]);

  const stats = [
    { label: "Total users", value: totalUsers },
    { label: "Active (7d)", value: activeUserIds.length },
    { label: "Classes", value: totalClasses },
    { label: "Assignments", value: totalAssignments },
    { label: "Exams", value: totalExams },
    { label: "Plans generated", value: totalPlansGenerated },
  ];

  return (
    <div className="space-y-8">
      <h1 className="font-heading text-2xl font-semibold">Admin</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="py-4">
              <p className="text-2xl font-semibold">{s.value}</p>
              <p className="text-sm text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 font-heading text-lg font-semibold">Recent signups</h2>
          <div className="space-y-2">
            {recentSignups.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span className="truncate">{u.email}</span>
                <div className="flex shrink-0 items-center gap-2">
                  {!u.onboardingCompletedAt && (
                    <Badge variant="outline">Not onboarded</Badge>
                  )}
                  <span className="text-muted-foreground">
                    {u.createdAt.toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
            {recentSignups.length === 0 && (
              <p className="text-sm text-muted-foreground">No signups yet.</p>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-heading text-lg font-semibold">
            Events, last 7 days
          </h2>
          <div className="space-y-2">
            {eventCounts.map((e) => (
              <div
                key={e.name}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span className="font-mono text-xs">{e.name}</span>
                <span className="font-medium">{e._count.name}</span>
              </div>
            ))}
            {eventCounts.length === 0 && (
              <p className="text-sm text-muted-foreground">No events yet.</p>
            )}
          </div>
        </section>
      </div>

      <section>
        <h2 className="mb-3 font-heading text-lg font-semibold">Recent activity</h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Event</th>
                <th className="px-3 py-2 font-medium">User</th>
                <th className="px-3 py-2 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {recentEvents.map((e, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{e.name}</td>
                  <td className="max-w-[200px] truncate px-3 py-2">{e.user.email}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {e.createdAt.toLocaleString()}
                  </td>
                </tr>
              ))}
              {recentEvents.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">
                    No activity yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-heading text-lg font-semibold">Feedback</h2>
        <div className="space-y-2">
          {recentFeedback.map((f, i) => (
            <div key={i} className="rounded-lg border border-border px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{f.context}</Badge>
                  {f.rating && <span>{f.rating}/5</span>}
                </div>
                <span className="text-xs text-muted-foreground">
                  {f.user.email} · {f.createdAt.toLocaleDateString()}
                </span>
              </div>
              {f.message && <p className="mt-2 text-muted-foreground">{f.message}</p>}
            </div>
          ))}
          {recentFeedback.length === 0 && (
            <p className="text-sm text-muted-foreground">No feedback yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
