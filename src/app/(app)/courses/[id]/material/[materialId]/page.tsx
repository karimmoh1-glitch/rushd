import { aiEnabled } from "@/lib/env";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, MessageSquareText } from "lucide-react";
import { requireUser } from "@/lib/auth/dal";
import { getMaterial } from "@/lib/course/retrieval";
import { formatDateInZone } from "@/lib/time/zone";
import { buttonVariants } from "@/components/ui/button";
import { RubricTable } from "@/components/course/rubric-table";

export const metadata: Metadata = { title: "Course material" };

const KIND_LABEL = { PAGE: "Page", ASSIGNMENT: "Assignment", ANNOUNCEMENT: "Announcement", MODULE_ITEM: "Module item", SYLLABUS: "Syllabus" } as const;

export default async function MaterialPage({ params }: { params: Promise<{ id: string; materialId: string }> }) {
  const user = await requireUser();
  const { id, materialId } = await params;
  const material = await getMaterial(user.id, materialId, { classId: id });
  if (!material) notFound();

  let postedText: string | null = null;
  if (material.postedAt) {
    const verb = material.kind === "ASSIGNMENT" ? "Due" : material.kind === "SYLLABUS" ? "Imported" : "Posted";
    const date = formatDateInZone(material.postedAt, user.profile?.timezone, { month: "short", day: "numeric", year: "numeric" });
    postedText = ` · ${verb} ${date}`;
  }

  return (
    <article className="max-w-3xl space-y-6">
      <header className="space-y-2">
        <Link href={`/courses/${material.classId}`} className="text-sm text-muted-foreground hover:text-foreground">
          {material.className}
        </Link>
        <h1 className="text-[1.75rem] font-medium leading-tight tracking-tight">{material.title}</h1>
        <p className="text-sm text-muted-foreground">
          {KIND_LABEL[material.kind]}
          {postedText}
          {material.pointsPossible != null && ` · ${material.pointsPossible} points`}
          {material.kind === "SYLLABUS" ? " · From your syllabus, imported by you" : " · Mirrored from Canvas"}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {material.url && (
            <a href={material.url} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline" })}>
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Open in Canvas
            </a>
          )}
          {aiEnabled && (
            <Link href={`/tutor?classId=${material.classId}`} className={buttonVariants({ variant: "outline" })}>
              <MessageSquareText className="h-4 w-4" aria-hidden="true" />
              Ask the tutor
            </Link>
          )}
        </div>
      </header>
      {material.outline && (material.outline.objectives.length > 0 || material.outline.grading.length > 0) && (
        <div className="grid gap-6 sm:grid-cols-2">
          {material.outline.objectives.length > 0 && (
            <section aria-labelledby="objectives-heading" className="space-y-2">
              <h2 id="objectives-heading" className="text-base font-semibold">
                Learning objectives
              </h2>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {material.outline.objectives.map((objective) => (
                  <li key={objective}>{objective}</li>
                ))}
              </ul>
            </section>
          )}
          {material.outline.grading.length > 0 && (
            <section aria-labelledby="grading-heading" className="space-y-2">
              <h2 id="grading-heading" className="text-base font-semibold">
                Grading breakdown
              </h2>
              <ul className="divide-y divide-border text-sm">
                {material.outline.grading.map((entry) => (
                  <li key={entry.label} className="flex justify-between gap-3 py-1.5">
                    <span>{entry.label}</span>
                    <span className="tabular-nums text-muted-foreground">{entry.weight}%</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      {material.body ? (
        <div className="whitespace-pre-wrap text-[15px] leading-relaxed">{material.body}</div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {material.kind === "SYLLABUS" ? "No text was saved for this syllabus." : "Canvas didn't provide any text for this item."}
        </p>
      )}
      {material.kind === "ASSIGNMENT" && (
        <section aria-labelledby="rubric-heading" className="space-y-3">
          <h2 id="rubric-heading" className="text-base font-semibold">Rubric</h2>
          {material.rubric ? <RubricTable rubric={material.rubric} /> : <p className="text-sm text-muted-foreground">No rubric was published in Canvas for this assignment.</p>}
        </section>
      )}
    </article>
  );
}
