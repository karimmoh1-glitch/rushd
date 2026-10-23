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

const KIND_LABEL = { PAGE: "Page", ASSIGNMENT: "Assignment", ANNOUNCEMENT: "Announcement", MODULE_ITEM: "Module item" } as const;

export default async function MaterialPage({ params }: { params: Promise<{ id: string; materialId: string }> }) {
  const user = await requireUser();
  const { id, materialId } = await params;
  const material = await getMaterial(user.id, materialId, { classId: id });
  if (!material) notFound();

  let postedText: string | null = null;
  if (material.postedAt) {
    const verb = material.kind === "ASSIGNMENT" ? "Due" : "Posted";
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
          {" · Mirrored from Canvas"}
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
      {material.body ? (
        <div className="whitespace-pre-wrap text-[15px] leading-relaxed">{material.body}</div>
      ) : (
        <p className="text-sm text-muted-foreground">Canvas didn&apos;t provide any text for this item.</p>
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
