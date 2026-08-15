import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { ClassCard } from "./class-card";
import { AddClassButton } from "./add-class-button";

export const metadata: Metadata = {
  title: "Classes",
};

export default async function ClassesPage() {
  const user = await requireUser();

  const classes = await db.class.findMany({
    where: { userId: user.id },
    orderBy: [{ archived: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      teacher: true,
      period: true,
      color: true,
      priority: true,
      archived: true,
      _count: { select: { assignments: true, exams: true } },
    },
  });

  const active = classes.filter((c) => !c.archived);
  const archived = classes.filter((c) => c.archived);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Classes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The classes your assignments and exams belong to.
          </p>
        </div>
        <AddClassButton />
      </div>

      {classes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-muted-foreground">No classes yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add your first class to start tracking assignments and exams.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {active.map((c) => (
            <ClassCard
              key={c.id}
              data={{
                id: c.id,
                name: c.name,
                teacher: c.teacher ?? undefined,
                period: c.period ?? undefined,
                color: c.color,
                priority: c.priority,
                archived: c.archived,
                assignmentCount: c._count.assignments,
                examCount: c._count.exams,
              }}
            />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Archived
          </h2>
          <div className="space-y-3">
            {archived.map((c) => (
              <ClassCard
                key={c.id}
                data={{
                  id: c.id,
                  name: c.name,
                  teacher: c.teacher ?? undefined,
                  period: c.period ?? undefined,
                  color: c.color,
                  priority: c.priority,
                  archived: c.archived,
                  assignmentCount: c._count.assignments,
                  examCount: c._count.exams,
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
